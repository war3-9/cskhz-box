/** IDs are four bytes, never a UTF-8/codepage conversion. Hex follows file byte order. */
export const rawcodeString = (bytes: number[]): string => bytes.every(b => b >= 0x21 && b <= 0x7e)
  ? String.fromCharCode(...bytes) : `0x${bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('')}`;
export function rawcodeBytes(id: string): number[] | null {
  if (/^[\x21-\x7e]{4}$/.test(id)) return Array.from(id, c => c.charCodeAt(0));
  if (!/^0x[0-9A-F]{8}$/.test(id)) return null;
  const bytes = id.slice(2).match(/../g)!.map(hex => parseInt(hex, 16));
  return bytes.every(b => b >= 0x21 && b <= 0x7e) ? null : bytes;
}
export const validRawcode = (id: string) => rawcodeBytes(id)?.some(b => b !== 0) === true;
export const escapedRawcode = (id: string): string | null => {
  const bytes = rawcodeBytes(id);
  return bytes && id.length !== 4 ? `'${bytes.map(b => `\\${String(b).padStart(3, '0')}`).join('')}'` : null;
};
