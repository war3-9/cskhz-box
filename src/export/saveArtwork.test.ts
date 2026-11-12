import { beforeEach, expect, it, vi } from "vitest";
import { artworkPath, saveArtwork } from "./saveArtwork";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { download } from "../shared/download";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("../shared/download", () => ({ download: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isTauri).mockReturnValue(true);
});

it("adds the encoding suffix without changing folders or matching extensions", () => {
  expect(artworkPath("F:\\道具.v1\\作品", "png")).toBe("F:\\道具.v1\\作品.png");
  expect(artworkPath("F:\\作品.PNG", "png")).toBe("F:\\作品.PNG");
  expect(artworkPath("F:\\作品.jpeg", "jpeg")).toBe("F:\\作品.jpeg");
  expect(artworkPath("F:\\作品.png", "blp")).toBe("F:\\作品.png.blp");
  expect(artworkPath("F:\\作品. ", "tga")).toBe("F:\\作品.tga");
  expect(() => artworkPath("F:\\", "png")).toThrow("完整");
});

it.each(["png", "jpeg", "blp", "tga"] as const)(
  "writes actual %s bytes to the normalized native path",
  async (format) => {
    vi.mocked(save).mockResolvedValue("F:\\道具");
    const blob = new Blob([new Uint8Array([0, 128, 255, 42])]);
    expect(await saveArtwork(blob, "CON", format)).toBe(true);
    const ext = format === "jpeg" ? "jpg" : format;
    expect(save).toHaveBeenCalledWith({
      defaultPath: `_CON.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    expect(invoke).toHaveBeenCalledWith("write_file", {
      path: `F:\\道具.${ext}`,
      bytes: [0, 128, 255, 42],
    });
  },
);

it("does not write or announce success when save is cancelled", async () => {
  vi.mocked(save).mockResolvedValue(null);
  expect(await saveArtwork(new Blob(), "作品", "png")).toBe(false);
  expect(invoke).not.toHaveBeenCalled();
});

it("propagates native write failure to the dialog", async () => {
  vi.mocked(save).mockResolvedValue("F:\\作品.png");
  vi.mocked(invoke).mockRejectedValue("Access denied");
  await expect(saveArtwork(new Blob(), "作品", "png")).rejects.toBe(
    "Access denied",
  );
});

it("keeps browser download working", async () => {
  vi.mocked(isTauri).mockReturnValue(false);
  const blob = new Blob();
  expect(await saveArtwork(blob, "游戏/图标", "tga")).toBe(true);
  expect(download).toHaveBeenCalledWith(blob, "游戏_图标.tga");
  expect(save).not.toHaveBeenCalled();
});

it('sends single export bytes and the shared child folder to the native writer', async () => {
  const blob = new Blob([new Uint8Array([1, 128, 255])]);
  expect(await saveArtwork(blob, '道具', 'png', { directory: 'F:/exports', subdirectory: 'war3mapImported\\' })).toBe(true);
  expect(invoke).toHaveBeenCalledWith('write_batch_image', { directory: 'F:/exports', subdirectory: 'war3mapImported', filename: '道具.png', bytes: [1, 128, 255] });
  expect(save).not.toHaveBeenCalled();
});
it('rejects invalid child folders before writing single exports', async () => {
  await expect(saveArtwork(new Blob(), '道具', 'png', { directory: 'F:/exports', subdirectory: '../escape' })).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});
