import { expect, it } from 'vitest';
import { decodeTexture } from './textures';

it('identifies MHEB as requiring native compatibility decoding instead of a broken image', async () => {
  const bytes = new TextEncoder().encode('MHEB\x01\0\0\0').buffer;
  const before = new Uint8Array(bytes).slice();
  await expect(decodeTexture(bytes, 'encrypted.blp')).rejects.toThrow('ModelEncrypt v1');
  expect(new Uint8Array(bytes)).toEqual(before);
});
