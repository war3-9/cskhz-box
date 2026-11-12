import { beforeEach, expect, it, vi } from "vitest";
import type { BatchJob } from "./batchExport";
import { useBatchState } from "./batchState";
import { exportBatch } from "./batchExport";
import { renderDocument } from "./render";
import { AiBatchNames } from './aiBatch';
import { rasterizeBatchText } from './batchText';
import { sortAssets } from '../assets/sortAssets';
vi.mock("./render", () => ({
  renderDocument: vi.fn(async () => new Blob(["encoded"])),
}));
vi.mock('./batchText', () => ({ rasterizeBatchText: vi.fn(async document => document) }));
const job: BatchJob = {
  document: {
    name: "原任务",
    width: 128,
    height: 128,
    canvasCreated: true,
    layers: [
      {
        id: "target",
        name: "旧",
        kind: "asset",
        x: 64,
        y: 64,
        width: 64,
        height: 64,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        imagePath: "old",
      },
    ],
  },
  layerId: "target",
  assets: [
    {
      id: "new",
      name: "新",
      imagePath: "new",
      thumbnailPath: "",
      width: 64,
      height: 64,
      categoryId: "c",
      groupId: "g",
      source: "user",
    },
  ],
  count: 3,
  names: ["甲"],
  format: "png",
  directory: "dir",
};
beforeEach(() => {
  vi.clearAllMocks();
  useBatchState.setState({ busy: false });
});
it("cycles independent copies, reports progress and releases editing lock", async () => {
  const snapshot = JSON.stringify(job);
  const writer = vi.fn(async (_directory: string, filename: string) => {
    expect(useBatchState.getState().busy).toBe(true);
    return filename;
  });
  const progress = vi.fn();
  expect(await exportBatch({ ...job, names: [] }, progress, writer)).toEqual([
    "1.png",
    "2.png",
    "3.png",
  ]);
  expect(renderDocument).toHaveBeenCalledTimes(3);
  expect(vi.mocked(renderDocument).mock.calls[0][0].layers[0].imagePath).toBe(
    "new",
  );
  expect(JSON.stringify(job)).toBe(snapshot);
  expect(progress.mock.calls).toEqual([[1], [2], [3]]);
  expect(useBatchState.getState().busy).toBe(false);
});
it('exports in the selected preview order and cycles that order without changing the library', async () => {
  const assets = ['图10', '图2', '图1'].map((name, index) => ({
    ...job.assets[0], id: String(index), name, imagePath: name,
  }));
  const sorted = sortAssets(assets, 'natural');
  const writer = vi.fn(async (_directory: string, filename: string) => filename);
  await exportBatch({ ...job, assets: sorted, count: 4, names: [] }, vi.fn(), writer);
  expect(sorted.map(asset => asset.name)).toEqual(['图1', '图2', '图10']);
  expect(assets.map(asset => asset.name)).toEqual(['图10', '图2', '图1']);
  expect(vi.mocked(renderDocument).mock.calls.map(call => call[0].layers[0].imagePath))
    .toEqual(['图1', '图2', '图10', '图1']);
  expect(writer.mock.calls.map(call => call[1])).toEqual(['1.png', '2.png', '3.png', '4.png']);
});
it("stops on write failure, keeps source and releases editing lock", async () => {
  const snapshot = JSON.stringify(job);
  await expect(
    exportBatch(job, vi.fn(), async () => {
      throw new Error("disk full");
    }),
  ).rejects.toThrow("disk full");
  expect(JSON.stringify(job)).toBe(snapshot);
  expect(useBatchState.getState().busy).toBe(false);
  expect(renderDocument).toHaveBeenCalledTimes(1);
});
it("returns partial outputs and failure statistics without re-exporting completed images", async () => {
  const writer = vi.fn(async (_directory: string, filename: string) => {
    if (filename === "2.png") throw new Error("exists"); return filename;
  });
  const result = await exportBatch({ ...job, names: [] }, vi.fn(), writer, { stopped: false });
  expect(result).toMatchObject({ outputs: ["1.png"], status: "failed", error: "Error: exists" });
  expect(writer).toHaveBeenCalledTimes(2); expect(useBatchState.getState().busy).toBe(false);
});
it("stops after a completed write and preserves its output", async () => {
  const control = { stopped: false };
  const writer = vi.fn(async (_directory: string, filename: string) => { control.stopped = true; return filename; });
  expect(await exportBatch(job, vi.fn(), writer, control)).toMatchObject({ outputs: ["甲.png"], status: "stopped" });
  expect(writer).toHaveBeenCalledOnce();
});

it('writes every ordinary batch image into the requested child folder', async () => {
  const writer = vi.fn(async (_directory: string, filename: string) => filename);
  await exportBatch({ ...job, subdirectory: 'war3mapImported\\' }, vi.fn(), writer);
  expect(writer).toHaveBeenCalledTimes(3);
  for (const call of writer.mock.calls) expect(call).toEqual(['dir', expect.stringMatching(/\.png$/), expect.any(Blob), 'war3mapImported']);
});
it('rejects invalid child folders before rendering a batch', async () => {
  await expect(exportBatch({ ...job, subdirectory: '../escape' }, vi.fn())).rejects.toThrow();
  expect(renderDocument).not.toHaveBeenCalled();
  expect(useBatchState.getState().busy).toBe(false);
});

it('adds padded filename numbers in TXT order only when enabled', async () => {
  const writer = vi.fn(async (_directory: string, filename: string) => filename);
  const input = { ...job, count: 4, names: ['D', 'B', 'A', 'C'], namingMode: 'txt' as const };
  expect(await exportBatch({ ...input, numberFilenames: true }, vi.fn(), writer)).toEqual([
    '0001_D.png', '0002_B.png', '0003_A.png', '0004_C.png',
  ]);
  expect(await exportBatch({ ...input, numberFilenames: false }, vi.fn(), writer)).toEqual([
    'D.png', 'B.png', 'A.png', 'C.png',
  ]);
});

it('keeps TXT names safe and falls back to numbers without losing sequence', async () => {
  const writer = vi.fn(async (_directory: string, filename: string) => filename);
  expect(await exportBatch({ ...job, names: ['A/B', 'A/B'], numberFilenames: true }, vi.fn(), writer)).toEqual([
    '0001_A_B.png', '0002_A_B (2).png', '0003_3.png',
  ]);
});

it('uses sufficient padding for a 10000-item batch without changing replacement text', async () => {
  const document = { ...job.document, layers: [...job.document.layers, {
    ...job.document.layers[0], id: 'text', text: { content: '旧字', fontId: 'font', fontSize: 20, color: '#fff' },
  }] };
  const control = { stopped: false };
  const writer = vi.fn(async (_directory: string, filename: string) => { control.stopped = true; return filename; });
  expect(await exportBatch({ ...job, document, count: 10000, numberFilenames: true, replaceText: true, textLayerId: 'text' }, vi.fn(), writer, control))
    .toMatchObject({ outputs: ['00001_甲.png'], status: 'stopped' });
  expect(vi.mocked(rasterizeBatchText).mock.calls[0][0].layers[1].text?.content).toBe('甲');
  expect(document.layers[1].text?.content).toBe('旧字');
});

it('ignores a retained numbering choice in AI naming mode', async () => {
  const finish = vi.fn(async () => {});
  const start = vi.spyOn(AiBatchNames, 'start').mockResolvedValue({ name: async () => 'AI名称', finish } as unknown as AiBatchNames);
  try {
    const writer = vi.fn(async (_directory: string, filename: string) => filename);
    expect(await exportBatch({ ...job, count: 1, namingMode: 'ai', numberFilenames: true }, vi.fn(), writer)).toEqual(['AI名称.png']);
    expect(finish).toHaveBeenCalledOnce();
  } finally { start.mockRestore(); }
});
