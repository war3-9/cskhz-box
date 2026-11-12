import { afterEach, expect, it, vi } from 'vitest';
import { decodeTexture } from './textures';
afterEach(() => vi.unstubAllGlobals());
it('uses BLP2 mip pixels for map quality while preserving full texture pixels', async () => {
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
  const bytes = new ArrayBuffer(148 + (512 * 512 + 256 * 256) * 4), view = new DataView(bytes), pixels = new Uint8Array(bytes);
  pixels.set(new TextEncoder().encode('BLP2')); view.setUint8(8, 3); view.setUint32(12, 512, true); view.setUint32(16, 512, true);
  view.setUint32(20, 148, true); view.setUint32(84, 512 * 512 * 4, true); view.setUint32(24, 148 + 512 * 512 * 4, true); view.setUint32(88, 256 * 256 * 4, true);
  for (let i = 148; i < 148 + 512 * 512 * 4; i += 4) pixels.set([0, 0, 255, 255], i);
  for (let i = 148 + 512 * 512 * 4; i < pixels.length; i += 4) pixels.set([255, 0, 0, 255], i);
  const [preview] = await decodeTexture(bytes, 'texture.blp', 256), [full] = await decodeTexture(bytes, 'texture.blp');
  expect([preview.width, preview.height]).toEqual([256, 256]); expect([...preview.data.slice(0, 4)]).toEqual([0, 0, 255, 255]);
  expect([full.width, full.height]).toEqual([512, 512]); expect([...full.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
  expect(preview.data.byteLength).toBe(full.data.byteLength / 4);
  view.setUint32(24, bytes.byteLength - 2, true); await expect(decodeTexture(bytes, 'broken.blp', 256)).rejects.toThrow('已损坏');
});
