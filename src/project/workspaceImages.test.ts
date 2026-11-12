import { expect, it, vi } from 'vitest';
import { workspaceImages } from './workspaceImages';
import { storeImage } from '../assets/imageRepository';
import { importImage } from '../shared/image';
vi.mock('../assets/imageRepository', () => ({
  storeImage: vi.fn().mockResolvedValue('blob:http://localhost/id'),
  storedImageReference: (path: string) => path === 'blob:http://localhost/id' ? `library-image://${'a'.repeat(64)}` : path,
  restoredImageUrl: (path: string) => path.startsWith('library-image://') ? 'blob:http://localhost/id' : path,
  prepareImageReference: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../shared/image', () => ({ importImage: vi.fn() }));
it('externalizes repeated inline pixels once, preserves metadata and restores durable references', async () => {
  vi.mocked(storeImage).mockClear();
  const pixels = 'data:image/png;base64,AAAA';
  const original = { document: { layers: [{ imagePath:pixels, name:pixels }] }, library: { assets: [{ imagePath:pixels,thumbnailPath:pixels }] } };
  const saved = await workspaceImages(original) as typeof original;
  expect(storeImage).toHaveBeenCalledTimes(1);
  expect(saved.library.assets[0].imagePath).toBe(`library-image://${'a'.repeat(64)}`);
  expect(saved.library.assets[0].thumbnailPath).toBe(saved.library.assets[0].imagePath);
  expect(saved.document.layers[0].name).toBe(pixels);
  expect(original.library.assets[0].imagePath).toBe(pixels);
  const restored = await workspaceImages(saved,true) as typeof original;
  expect(restored.document.layers[0].imagePath).toBe('blob:http://localhost/id');
});

it('migrates old inline layers without fetch when desktop CSP blocks data URLs', async () => {
  const blockedFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', blockedFetch);
  vi.mocked(storeImage).mockClear();
  try {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const jpeg = 'data:image/jpeg;base64,/9j/\nAA==';
    const original = { document: { layers: [{ imagePath: png }, { imagePath: jpeg }] } };
    const restored = await workspaceImages(original, true) as typeof original;
    expect(restored.document.layers.every(layer => layer.imagePath === 'blob:http://localhost/id')).toBe(true);
    const blobs = vi.mocked(storeImage).mock.calls.map(call => call[0]);
    expect(blobs.map(blob => blob.type)).toEqual(['image/png', 'image/jpeg']);
    expect([...new Uint8Array(await blobs[0].arrayBuffer())]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect([...new Uint8Array(await blobs[1].arrayBuffer())]).toEqual([255, 216, 255, 0]);
    expect(original.document.layers[0].imagePath).toBe(png);
    expect(blockedFetch).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

it('regenerates old user thumbnails without fetching inline originals', async () => {
  const blockedFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', blockedFetch);
  vi.mocked(importImage).mockResolvedValueOnce({ imagePath: 'original', thumbnailPath: 'small' } as Awaited<ReturnType<typeof importImage>>);
  try {
    const pixels = 'data:image/png;base64,iVBORw0KGgo=';
    const original = { library: { assets: [{ source: 'user', imagePath: pixels, thumbnailPath: pixels }] } };
    const restored = await workspaceImages(original, true) as typeof original;
    expect(restored.library.assets[0]).toEqual({ source: 'user', imagePath: 'original', thumbnailPath: 'small' });
    const file = vi.mocked(importImage).mock.calls.at(-1)![0];
    expect(file.type).toBe('image/png');
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(blockedFetch).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

