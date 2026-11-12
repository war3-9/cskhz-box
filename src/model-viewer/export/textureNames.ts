import { normalizePath } from '../types';

interface Field { start: number; end: number; path: string; fixed: boolean }
const encoder = new TextEncoder(), decoder = new TextDecoder();
function fields(bytes: Uint8Array, path: string): Field[] {
  if (decoder.decode(bytes.subarray(0, 4)) === 'MDLX') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 4; offset + 8 <= bytes.length;) {
      const length = view.getUint32(offset + 4, true), end = offset + 8 + length;
      if (end > bytes.length) throw new Error('模型数据块不完整，无法安全重命名贴图');
      if (decoder.decode(bytes.subarray(offset, offset + 4)) === 'TEXS') {
        if (length % 268) throw new Error('模型贴图列表损坏');
        const result: Field[] = [];
        for (let start = offset + 12; start < end; start += 268) {
          const field = bytes.subarray(start, start + 260), zero = field.indexOf(0);
          const name = decoder.decode(zero < 0 ? field : field.subarray(0, zero));
          if (name) result.push({ start, end: start + 260, path: name, fixed: true });
        }
        return result;
      }
      offset = end;
    }
    return [];
  }
  if (!/\.mdl$/i.test(path)) throw new Error('无法识别模型格式');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  // Skip comments and other quoted values; only Image fields are references.
  const tokens = /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"[^"\r\n]*"|\bImage\s+"([^"\r\n]*)"/g;
  const result: Field[] = [];
  for (const match of text.matchAll(tokens)) if (match[1]) {
    const start = encoder.encode(text.slice(0, match.index + match[0].indexOf('"') + 1)).length;
    result.push({ start, end: start + encoder.encode(match[1]).length, path: match[1].replace(/\\\\/g, '\\'), fixed: false });
  }
  return result;
}

export function modelTexturePaths(bytes: Uint8Array, path: string) { return fields(bytes, path).map(field => field.path); }
export function textureNames(paths: string[], output: string) {
  const stem = output.replace(/\.[^./\\]+$/, ''), seen = new Set<string>();
  return paths.filter(path => { const key = normalizePath(path); if (seen.has(key)) return false; seen.add(key); return true; })
    .map((path, index) => ({ path, output: `${stem}${index + 1}${path.match(/\.[^./\\]+$/)?.[0].toLowerCase() || '.blp'}` }));
}

export function rewriteTextureNames(bytes: Uint8Array, path: string, names: { path: string; output: string }[]) {
  const mapping = new Map(names.map(item => [normalizePath(item.path), item.output.replace(/\//g, '\\')]));
  const slots = fields(bytes, path);
  let result = Uint8Array.from(bytes);
  for (const field of slots.reverse()) {
    const name = mapping.get(normalizePath(field.path)); if (!name) continue;
    const value = encoder.encode(name);
    if (value.length >= 260) throw new Error('贴图新名称过长，请缩短前缀');
    if (field.fixed) { result.fill(0, field.start, field.end); result.set(value, field.start); }
    else {
      // MDL paths use literal backslashes (as emitted by generateMDL), not JSON escaping.
      const next = new Uint8Array(result.length - (field.end - field.start) + value.length);
      next.set(result.subarray(0, field.start)); next.set(value, field.start); next.set(result.subarray(field.end), field.start + value.length); result = next;
    }
  }
  return result;
}
