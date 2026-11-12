import { beforeEach, expect, it, vi } from 'vitest';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { decodeTexture } from '../model-viewer/resources/textures';
import { writeBatchImage } from '../export/batchIO';
import { nextIconPairSequence, writeIconPair } from '../export/iconPairs/io';
import { conversionCanvas, convertImages, convertedFilename, selectConversionSource, type ConversionSource } from './service';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../model-viewer/resources/textures', () => ({ decodeTexture: vi.fn() }));
vi.mock('../export/encodeCanvas', () => ({ encodeCanvas: vi.fn(async () => new Blob(['encoded'])) }));
vi.mock('../export/batchIO', () => ({ writeBatchImage: vi.fn(async () => '图标.png') }));
vi.mock('../export/iconPairs/io', () => ({ nextIconPairSequence: vi.fn(async () => 1), writeIconPair: vi.fn(async () => ['normal', 'disabled']) }));

const source: ConversionSource = {
  directory: 'F:/图片', outputDirectory: 'F:/图片/转换图片',
  files: ['中文.BLP', 'bad.tga', 'other.jpeg'].map(name => ({ name, path: `F:/图片/${name}` })),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockResolvedValue(new ArrayBuffer(0));
  vi.mocked(decodeTexture).mockResolvedValue([{ width: 64, height: 64 } as ImageData]);
  vi.mocked(writeBatchImage).mockResolvedValue('图标.png');
  vi.mocked(nextIconPairSequence).mockResolvedValue(1);
  vi.mocked(writeIconPair).mockResolvedValue(['normal', 'disabled']);
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ putImageData() {}, drawImage() {}, fillRect() {}, getImageData: () => ({ data: new Uint8Array(64 * 64 * 4) }) }) }) });
});

it('uses native single-file/folder pickers, and cancellation leaves files untouched', async () => {
  vi.mocked(open).mockResolvedValueOnce(null);
  expect(await selectConversionSource(false)).toBeNull();
  expect(invoke).not.toHaveBeenCalled();
  vi.mocked(open).mockResolvedValueOnce('F:/图片');
  vi.mocked(invoke).mockResolvedValueOnce(source);
  expect(await selectConversionSource(true)).toEqual(source);
  expect(open).toHaveBeenLastCalledWith({ title: '选择需要转换的图片文件夹', directory: true, multiple: false });
  expect(invoke).toHaveBeenLastCalledWith('image_conversion_scan', { path: 'F:/图片' });
  vi.mocked(open).mockResolvedValueOnce('F:/图片/中文.BLP');
  await selectConversionSource(false);
  expect(open).toHaveBeenLastCalledWith(expect.objectContaining({
    directory: false, multiple: false, filters: [{ name: '图片文件', extensions: ['blp', 'tga', 'png', 'jpg', 'jpeg'] }],
  }));
});

it('continues after a damaged image and reports progress and real output counts', async () => {
  vi.mocked(decodeTexture).mockRejectedValueOnce(new Error('损坏图片'));
  const progress = vi.fn();
  const snapshot = JSON.stringify(source);
  const result = await convertImages(source, 'png', progress);
  expect(result).toEqual({ succeeded: 2, failed: [{ name: '中文.BLP', error: '损坏图片' }],
    stopped: false, total: 3, outputDirectory: source.outputDirectory });
  expect(writeBatchImage).toHaveBeenCalledTimes(2);
  expect(writeBatchImage).toHaveBeenNthCalledWith(1, source.directory, 'bad.png', expect.any(Blob), '转换图片');
  expect(writeBatchImage).toHaveBeenNthCalledWith(2, source.directory, 'other.png', expect.any(Blob), '转换图片');
  expect(progress).toHaveBeenLastCalledWith({ done: 3, total: 3, name: 'other.jpeg' });
  expect(JSON.stringify(source)).toBe(snapshot);
});

it('does not count failed writes as success and can stop before the next image', async () => {
  vi.mocked(writeBatchImage).mockRejectedValueOnce(new Error('无法保存'));
  const result = await convertImages(source, 'tga', () => {});
  expect(result.succeeded).toBe(2);
  expect(result.failed).toEqual([{ name: '中文.BLP', error: '无法保存' }]);
  vi.clearAllMocks();
  const stopped = await convertImages(source, 'blp', () => {}, () => true);
  expect(stopped).toMatchObject({ succeeded: 0, failed: [], stopped: true });
  expect(invoke).not.toHaveBeenCalled();
  let stop = false;
  const partial = await convertImages(source, 'blp', progress => { if (progress.done === 1) stop = true; }, () => stop);
  expect(partial).toMatchObject({ succeeded: 1, failed: [], stopped: true });
  expect(writeIconPair).toHaveBeenCalledTimes(1);
});

it('applies explicit square dimensions and only rounds original BLP dimensions', async () => {
  vi.mocked(decodeTexture).mockResolvedValue([{ width: 70, height: 33 } as ImageData]);
  for (const format of ['png', 'tga', 'jpg', 'blp'] as const) {
    for (const size of [0, 64, 128] as const) {
      const canvas = await conversionCanvas(new ArrayBuffer(0), 'x.png', format, size);
      expect([canvas.width, canvas.height]).toEqual(size ? [size, size] : format === 'blp' ? [128, 64] : [70, 33]);
    }
  }
});

it('retries paired name collisions and never counts failed pairs as successes', async () => {
  vi.mocked(writeIconPair).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('暗图写入失败'));
  vi.mocked(nextIconPairSequence).mockResolvedValueOnce(1).mockResolvedValueOnce(2);
  const result = await convertImages({ ...source, files: source.files.slice(0, 1) }, 'blp', () => {});
  expect(result).toMatchObject({ succeeded: 0, failed: [{ name: '中文.BLP', error: '暗图写入失败' }] });
  expect(nextIconPairSequence).toHaveBeenLastCalledWith(expect.anything(), '中文', 2);
  expect(writeBatchImage).not.toHaveBeenCalled();
});

it('retains original stems and maps JPG names without path changes', () => {
  expect(convertedFilename('中文 图标.BLP', 'jpg')).toBe('中文 图标.jpg');
  expect(convertedFilename('icon.v2.jpeg', 'blp')).toBe('icon.v2.blp');
});

it('rejects browser-only use before touching the filesystem', async () => {
  vi.mocked(isTauri).mockReturnValue(false);
  await expect(selectConversionSource(false)).rejects.toThrow('桌面版');
  await expect(convertImages(source, 'png', () => {})).rejects.toThrow('桌面版');
  expect(invoke).not.toHaveBeenCalled();
});
