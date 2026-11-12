import { expect, it } from 'vitest';
import { cleanIconPrefix, disabledRaster, iconPairNames, validateIconPairs } from './config';
import { encodeBlp } from '../gameFormats/blp';

it('requires a prefix, filters Windows characters and matches pair sequence', () => {
  expect(validateIconPairs({ enabled: true, prefix: '  ', brightness: 60 })).toBe('请输入文件头');
  expect(cleanIconPrefix(' tb:/\\*?  ')).toBe('tb_____');
  expect(iconPairNames('tb', 2)).toEqual({ normal: 'BTNtb(2).blp', disabled: 'DISBTNtb(2).blp' });
  for (const brightness of [NaN, -1, 101, 20.5]) expect(validateIconPairs({ enabled: true, prefix: 'tb', brightness })).toContain('亮度');
});
it('makes grayscale at the chosen brightness without changing alpha or source pixels', () => {
  const source = { width: 2, height: 2, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 255, 64]) };
  const before = new Uint8Array(source.data);
  const gray = disabledRaster(source, 60);
  expect([...gray.data]).toEqual([33, 33, 33, 255, 109, 109, 109, 128, 11, 11, 11, 0, 153, 153, 153, 64]);
  expect(source.data).toEqual(before);
  expect(disabledRaster(source, 0).data[0]).toBe(0);
  expect(disabledRaster(source, 100).data[12]).toBe(255);
  const normal = encodeBlp(source), dark = encodeBlp(gray);
  // Both BLPs preserve the exact independent alpha bytes at every mip level.
  const a = new DataView(normal.buffer), b = new DataView(dark.buffer);
  for (let level = 0; level < 2; level++) {
    const pixels = level ? 1 : 4;
    const alphaA = a.getUint32(28 + level * 4, true) + pixels;
    const alphaB = b.getUint32(28 + level * 4, true) + pixels;
    expect(dark.slice(alphaB, alphaB + pixels)).toEqual(normal.slice(alphaA, alphaA + pixels));
  }
  expect(() => disabledRaster(source, 200)).toThrow();
});
it('keeps grayscale BLP pixels within one rgb565 bucket across the entire gray ramp', () => {
  const data = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 256; i++) data.set([i, i, i, 255], i * 4);
  const bytes = encodeBlp({ width: 16, height: 16, data });
  const offset = new DataView(bytes.buffer).getUint32(28, true);
  for (let i = 0; i < 256; i++) {
    const palette = 156 + bytes[offset + i] * 4;
    expect(bytes[palette]).toBe(bytes[palette + 1]);
    expect(bytes[palette]).toBe(bytes[palette + 2]);
    expect(Math.abs(bytes[palette] - i)).toBeLessThanOrEqual(7);
  }
});
