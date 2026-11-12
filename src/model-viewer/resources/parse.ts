import { parseMDL, parseMDX } from 'war3-model';
const warnings = new WeakMap<ReturnType<typeof parseMDX>, string>();
export const modelWarning = (model: ReturnType<typeof parseMDX>) => warnings.get(model);
function binaryModel(bytes: ArrayBuffer) {
  try { return parseMDX(bytes); }
  catch (error) {
    // Collision shapes do not contribute to the preview. Retry only bounded MDX
    // chunks, excluding CLID, and keep original bytes for project/export IO.
    if (!(error instanceof RangeError)) throw error;
    const view = new DataView(bytes), chunks: Uint8Array[] = [new Uint8Array(bytes, 0, 4)]; let collision = false;
    for (let offset = 4; offset < bytes.byteLength;) {
      if (offset + 8 > bytes.byteLength) throw error;
      const length = view.getUint32(offset + 4, true), end = offset + 8 + length;
      if (end > bytes.byteLength) throw error;
      if (view.getUint32(offset, true) === 0x44494c43) collision = true;
      else chunks.push(new Uint8Array(bytes, offset, end - offset));
      offset = end;
    }
    if (!collision) throw error;
    const copy = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0)); let offset = 0;
    for (const chunk of chunks) { copy.set(chunk, offset); offset += chunk.length; }
    let model: ReturnType<typeof parseMDX>;
    try { model = parseMDX(copy.buffer); } catch { throw error; }
    warnings.set(model, '预览已跳过无法解析的碰撞体；原模型与导出内容保持完整。'); return model;
  }
}
export function parseModelBytes(bytes: ArrayBuffer, path: string) {
  const binary = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  const magic = new TextDecoder().decode(binary);
  if (magic === 'MDB3') throw new Error('MDB3 特殊模型格式：请在桌面版打开，桌面版会自动转换为标准 MDX。');
  if (magic === 'MHAC') throw new Error('MHAC 特殊模型格式：请在新版桌面查看器打开；兼容的 ModelEncrypt v1 资源会自动转换。');
  if (magic === 'MHEC') throw new Error('MHEC 特殊模型格式：请在新版桌面查看器打开；兼容的 v1 资源会自动转换。');
  if (magic === 'JRP1') throw new Error('JRP1 特殊模型格式：请在新版桌面查看器打开；已兼容的 v1 密钥配置会自动转换。');
  if (binary[0] === 77 && binary[1] === 90) throw new Error('这是使用模型扩展名的程序模块，不能作为模型预览。');
  return binary.length === 4 && binary[0] === 77 && binary[1] === 68 && binary[2] === 76 && binary[3] === 88 ? binaryModel(bytes) : /\.mdl$/i.test(path) ? parseMDL(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) : binaryModel(bytes);
}
