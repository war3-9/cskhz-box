import { beforeEach, expect, it, vi } from 'vitest';
import { exportBatch, type BatchJob } from '../batchExport';
import { useBatchState } from '../batchState';
import { batchSummary } from '../aiBatch';
import { nextIconPairSequence, writeIconPair } from './io';
import { renderIconPair } from './render';
import { rasterizeBatchText } from '../batchText';
import { saveSingleIconPair } from './export';
vi.mock('./io', () => ({ nextIconPairSequence: vi.fn(async (_dir, _prefix, start) => start), writeIconPair: vi.fn(async (_dir, prefix, sequence) => [`BTN${prefix}(${sequence}).blp`, `DISBTN${prefix}(${sequence}).blp`]) }));
vi.mock('./render', () => ({ renderIconPair: vi.fn(async () => ({ normal: new Blob(['normal']), disabled: new Blob(['dark']) })) }));
vi.mock('../batchText', () => ({ rasterizeBatchText: vi.fn(async doc => doc) }));
const job: BatchJob = {
  document: { name: '原任务', width: 122, height: 122, canvasCreated: true, layers: [
    { id: 'target', name: '原图', kind: 'asset', imagePath: 'old', x: 61, y: 61, width: 90, height: 90, rotation: 23, opacity: 1, visible: true, locked: false },
  ] },
  layerId: 'target', assets: [{ id: 'a', name: '素材', imagePath: 'new', thumbnailPath: 'new', width: 30, height: 30, groupId: 'g', categoryId: 'c', source: 'user' }],
  count: 2, directory: 'dir', names: ['ignored'], format: 'png', namingMode: 'ai',
  iconPairs: { enabled: true, prefix: 'tb', brightness: 60 },
};
beforeEach(() => { vi.clearAllMocks(); useBatchState.setState({ busy: false }); });
it('exports two files per item, skips AI/TXT, counts pairs and preserves the source', async () => {
  const before = JSON.stringify(job);
  const progress = vi.fn();
  const result = await exportBatch(job, progress, undefined, { stopped: false });
  expect(result).toMatchObject({ outputs: ['BTNtb(1).blp', 'DISBTNtb(1).blp', 'BTNtb(2).blp', 'DISBTNtb(2).blp'], requests: 0, iconPairs: true });
  expect(progress.mock.calls).toEqual([[1], [2]]);
  expect(renderIconPair).toHaveBeenCalledTimes(2);
  expect(vi.mocked(renderIconPair).mock.calls[0][0].layers[0]).toMatchObject({ width: 90, height: 90, imagePath: 'new', rotation: 0 });
  expect(JSON.stringify(job)).toBe(before);
  expect(useBatchState.getState().busy).toBe(false);
  expect(batchSummary(result as Exclude<typeof result, string[]>, false)).toContain('2 对图标，共 4 个 BLP 文件');
});
it('handles a racing filename collision and preserves matched sequence', async () => {
  vi.mocked(writeIconPair).mockResolvedValueOnce(null);
  const result = await exportBatch({ ...job, count: 1 }, vi.fn());
  expect(result).toEqual(['BTNtb(2).blp', 'DISBTNtb(2).blp']);
  expect(renderIconPair).toHaveBeenCalledOnce();
});
it('finishes the current pair before Stop and keeps successful pairs on later failure', async () => {
  const control = { stopped: false };
  vi.mocked(writeIconPair).mockImplementationOnce(async () => { control.stopped = true; return ['normal.blp', 'dark.blp']; });
  expect(await exportBatch(job, vi.fn(), undefined, control)).toMatchObject({ outputs: ['normal.blp', 'dark.blp'], status: 'stopped' });
  vi.mocked(writeIconPair).mockRejectedValueOnce(new Error('disk full'));
  expect(await exportBatch(job, vi.fn(), undefined, { stopped: false })).toMatchObject({ outputs: [], status: 'failed', error: 'Error: disk full' });
  expect(useBatchState.getState().busy).toBe(false);
});
it('uses the actual available filename for text on both variants', async () => {
  const layer = { ...job.document.layers[0], id: 'text', text: { content: 'old' } };
  vi.mocked(nextIconPairSequence).mockResolvedValueOnce(8);
  const document = { ...job.document, layers: [...job.document.layers, layer] } as BatchJob['document'];
  await exportBatch({ ...job, document, count: 1, replaceText: true, textLayerId: 'text' }, vi.fn());
  expect(rasterizeBatchText).toHaveBeenCalledOnce();
  expect(vi.mocked(renderIconPair).mock.calls[0][0].layers[1].text?.content).toBe('BTNtb(8)');
  expect(document.layers[1].text?.content).toBe('old');
});
it('rejects an invalid prefix before writing and honors Stop before rendering', async () => {
  await expect(exportBatch({ ...job, iconPairs: { ...job.iconPairs!, prefix: '' } }, vi.fn())).rejects.toThrow('请输入文件头');
  expect(writeIconPair).not.toHaveBeenCalled();
  expect(await exportBatch(job, vi.fn(), undefined, { stopped: true })).toMatchObject({ outputs: [], status: 'stopped' });
  expect(renderIconPair).not.toHaveBeenCalled();
});
it('single export uses the same paired writer and validates its configuration', async () => {
  expect(await saveSingleIconPair(job.document, job.iconPairs!, 'dir', 128)).toEqual(['BTNtb(1).blp', 'DISBTNtb(1).blp']);
  expect(renderIconPair).toHaveBeenCalledWith(job.document, 60, 128);
  await expect(saveSingleIconPair(job.document, { ...job.iconPairs!, prefix: '' }, 'dir')).rejects.toThrow('请输入文件头');
  await expect(saveSingleIconPair(job.document, job.iconPairs!, '')).rejects.toThrow('保存地址');
});
