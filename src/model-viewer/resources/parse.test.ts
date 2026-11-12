import fixture from './collision.fixture.json';
import { expect, it } from 'vitest';
import { parseMDX } from 'war3-model';
import { modelWarning, parseModelBytes } from './parse';
it('explains MHAC desktop support and rejects executable modules without modifying bytes', () => {
  for (const [header, expected] of [['MHAC\x01\0\0\0', 'MHAC 特殊模型格式'], ['MHEC\x01\0\0\0', 'MHEC 特殊模型格式'], ['JRP1\x01\0\0\0', 'JRP1 特殊模型格式'], ['MZ\0\0', '程序模块']]) {
    const bytes = new TextEncoder().encode(header).buffer, before = new Uint8Array(bytes).slice();
    expect(() => parseModelBytes(bytes, 'resource.mdx')).toThrow(expected);
    expect(new Uint8Array(bytes)).toEqual(before);
  }
});
it('explains MDB3 support without attempting to parse or modify it as MDX', () => {
  const bytes = new TextEncoder().encode('MDB3\x16\x09\x84\x96').buffer;
  const original = new Uint8Array(bytes).slice();
  expect(() => parseModelBytes(bytes, 'protected.mdx')).toThrow('MDB3 特殊模型格式');
  expect(new Uint8Array(bytes)).toEqual(original);
});
it('previews the real malformed collision fixture without changing any original bytes', () => {
  const bytes = Uint8Array.from(atob(fixture.base64), character => character.charCodeAt(0)).buffer, original = new Uint8Array(bytes).slice();
  expect(() => parseMDX(bytes)).toThrow(RangeError);
  const model = parseModelBytes(bytes, 'huasaoshumu.mdx');
  expect(model.Geosets.length).toBeGreaterThan(0); expect(model.Textures.length).toBeGreaterThan(0);
  expect(modelWarning(model)).toContain('碰撞体'); expect(new Uint8Array(bytes)).toEqual(original);
  expect(() => parseModelBytes(bytes.slice(0, bytes.byteLength - 1), 'truncated.mdx')).toThrow();
});
