import { expect, it, vi } from 'vitest';
import { importImage } from '../shared/image';
import { importAssetFiles, IMPORT_CONCURRENCY } from './importFiles';
import type { Asset } from '../shared/types';
vi.mock('../shared/image', () => ({ importImage: vi.fn() }));

it('bounds active imports, preserves file order and reports completed work', async () => {
  let active = 0, peak = 0;
  vi.mocked(importImage).mockImplementation(async file => {
    active++; peak = Math.max(active, peak);
    await new Promise(resolve => setTimeout(resolve, file.name === '0.png' ? 8 : 0));
    active--; return { name: file.name } as Asset;
  });
  const files = Array.from({ length: 30 }, (_, i) => new File(['x'], `${i}.png`));
  const progress = vi.fn();
  const result = await importAssetFiles(files, { signal: new AbortController().signal, onProgress: progress });
  expect(peak).toBe(IMPORT_CONCURRENCY);
  expect(result.map(asset => asset.name)).toEqual(files.map(file => file.name));
  expect(progress.mock.calls.map(call => call[0])).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
});

it('drains in-flight work and commits no result after cancellation or corrupt input', async () => {
  const controller = new AbortController();
  let started = 0;
  vi.mocked(importImage).mockImplementation(async () => { started++; controller.abort(); return {} as Asset; });
  await expect(importAssetFiles(Array.from({ length: 1000 }, () => new File(['x'], 'a.png')),
    { signal: controller.signal, onProgress: () => {} })).rejects.toThrow();
  expect(started).toBeLessThanOrEqual(IMPORT_CONCURRENCY);
  vi.mocked(importImage).mockRejectedValue(new Error('bad image'));
  await expect(importAssetFiles([new File(['x'], 'broken.png')],
    { signal: new AbortController().signal, onProgress: () => {} })).rejects.toThrow('broken.png');
});
