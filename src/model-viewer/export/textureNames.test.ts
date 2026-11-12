import { expect, it } from 'vitest';
import { modelTexturePaths, rewriteTextureNames, textureNames } from './textureNames';
import { parseMDL } from 'war3-model';
function mdx(paths: string[]) {
  const bytes = new Uint8Array(12 + paths.length * 268 + 12), text = new TextEncoder();
  bytes.set(text.encode('MDLXTEXS')); new DataView(bytes.buffer).setUint32(8, paths.length * 268, true);
  paths.forEach((path, i) => { bytes.set(text.encode(path), 16 + i * 268); bytes[12 + i * 268] = path ? 0 : 1; bytes[276 + i * 268] = 3; });
  bytes.set(text.encode('KEEP'), bytes.length - 12); new DataView(bytes.buffer).setUint32(bytes.length - 8, 4, true); bytes[bytes.length - 1] = 99;
  return bytes;
}
it('rewrites only TEXS paths, preserving replaceable slots, flags and every other model byte', () => {
  const source = mdx(['Textures\\a.blp', '', 'other.tga', 'textures/a.BLP']); const before = source.slice();
  const names = textureNames(modelTexturePaths(source, 'a.mdx'), 'tx(1).mdx');
  expect(names.map(n => n.output)).toEqual(['tx(1)1.blp', 'tx(1)2.tga']);
  const result = rewriteTextureNames(source, 'a.mdx', names);
  expect(modelTexturePaths(result, 'a.mdx')).toEqual(['tx(1)1.blp', 'tx(1)2.tga', 'tx(1)1.blp']);
  expect(source).toEqual(before); expect(result.length).toBe(source.length);
  for (let i = 0; i < source.length; i++) if (![16, 552, 820].some(start => i >= start && i < start + 260)) expect(result[i]).toBe(source[i]);
  expect(textureNames(['Textures\\a.blp'], 'tx(2).mdx')[0].output).toBe('tx(2)1.blp');
});
it('updates MDL Image fields without touching comments, other strings, or missing textures', () => {
  const text = '// Image "comment.blp"\nModel "Image ignored.blp" {}\nTextures 3 { Bitmap { Image "Textures\\\\a.blp", } Bitmap { Image "missing.blp", } Bitmap { Image "", ReplaceableId 1, } }';
  const source = new TextEncoder().encode(text);
  expect(modelTexturePaths(source, 'a.mdl')).toEqual(['Textures\\a.blp', 'missing.blp']);
  const result = rewriteTextureNames(source, 'a.mdl', [{ path: 'Textures/a.blp', output: 'tx(1)1.blp' }]);
  expect(new TextDecoder().decode(result)).toBe(text.replace('Textures\\\\a.blp', 'tx(1)1.blp'));
});
it('rejects truncated texture chunks and long names without modifying input', () => {
  const source = mdx(['a.blp']);
  expect(() => modelTexturePaths(source.slice(0, 20), 'a.mdx')).toThrow('不完整');
  expect(() => rewriteTextureNames(source, 'a.mdx', [{ path: 'a.blp', output: `${'a'.repeat(260)}.blp` }])).toThrow('过长');
});
it('keeps nested output files and both MDX and MDL internal references identical', () => {
  const bytes = mdx(['old.blp', 'skin.tga']);
  const names = textureNames(modelTexturePaths(bytes, 'a.mdx'), 'unit/buildings/jz(15).mdx');
  expect(names.map(n => n.output)).toEqual(['unit/buildings/jz(15)1.blp', 'unit/buildings/jz(15)2.tga']);
  expect(modelTexturePaths(rewriteTextureNames(bytes, 'a.mdx', names), 'a.mdx')).toEqual(['unit\\buildings\\jz(15)1.blp', 'unit\\buildings\\jz(15)2.tga']);
  const mdl = new TextEncoder().encode('Textures 1 { Bitmap { Image "old.blp", } }');
  const renamed = rewriteTextureNames(mdl, 'a.mdl', names);
  expect(modelTexturePaths(renamed, 'a.mdl')).toEqual(['unit\\buildings\\jz(15)1.blp']);
  expect(parseMDL(new TextDecoder().decode(renamed)).Textures[0].Image).toBe('unit\\buildings\\jz(15)1.blp');
});
