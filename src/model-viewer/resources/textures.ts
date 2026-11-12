import { decodeBLP, getBLPImageData } from 'war3-model';
import { decodeDds, parseHeaders, decodeDxt1, decodeDxt3, decodeDxt5 } from 'dds-parser';

const image = (bytes: Uint8Array, width: number, height: number) => new ImageData(new Uint8ClampedArray(bytes), width, height);
function raster(width: number, height: number) {
  if (typeof OffscreenCanvas !== 'undefined') { const canvas = new OffscreenCanvas(width, height); return { canvas, context: canvas.getContext('2d')! }; }
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return { canvas, context: canvas.getContext('2d')! };
}
function dimensions(width: number, height: number) {
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16777216) throw new Error('贴图尺寸无效或超过 1600 万像素');
}
function blp2(bytes: ArrayBuffer, maxSize: number) {
  const view = new DataView(bytes);
  if (bytes.byteLength < 148) throw new Error('BLP2 文件头不完整');
  const encoding = view.getUint8(8), alpha = view.getUint8(9), mode = view.getUint8(10);
  const originalWidth = view.getUint32(12, true), originalHeight = view.getUint32(16, true);
  dimensions(originalWidth, originalHeight);
  let level = 0;
  while (level < 15 && Math.max(originalWidth, originalHeight) / 2 ** level > maxSize && view.getUint32(24 + level * 4, true) && view.getUint32(88 + level * 4, true)) level++;
  const width = Math.max(1, originalWidth >> level), height = Math.max(1, originalHeight >> level);
  const offset = view.getUint32(20 + level * 4, true), length = view.getUint32(84 + level * 4, true);
  if (offset < 148 || offset + length > bytes.byteLength) throw new Error('BLP2 mipmap 已损坏');
  const src = new Uint8Array(bytes, offset, length), count = width * height;
  if (encoding === 2) {
    const decode = mode === 0 ? decodeDxt1 : mode === 1 ? decodeDxt3 : mode === 7 ? decodeDxt5 : undefined;
    if (!decode) throw new Error(`未知 BLP2 DXT 编码 ${mode}`);
    const required = Math.ceil(width / 4) * Math.ceil(height / 4) * (mode === 0 ? 8 : 16);
    if (length < required) throw new Error('BLP2 DXT 数据截断');
    return image(decode(src, width, height), width, height);
  }
  const out = new Uint8Array(count * 4);
  if (encoding === 1) {
    if (![0, 1, 4, 8].includes(alpha) || bytes.byteLength < 1172 || length < count + Math.ceil(count * alpha / 8)) throw new Error('BLP2 调色板或 Alpha 数据无效');
    const palette = new Uint8Array(bytes, 148, 1024);
    for (let i = 0; i < count; i++) {
      const p = src[i] * 4; out.set([palette[p + 2], palette[p + 1], palette[p]], i * 4);
      out[i * 4 + 3] = alpha ? ((src[count + Math.floor(i * alpha / 8)] >> (i * alpha % 8)) & ((1 << alpha) - 1)) * 255 / ((1 << alpha) - 1) : 255;
    }
  } else if (encoding === 3) {
    if (length < count * 4) throw new Error('BLP2 BGRA 数据截断');
    for (let i = 0; i < count; i++) out.set([src[i * 4 + 2], src[i * 4 + 1], src[i * 4], src[i * 4 + 3]], i * 4);
  } else throw new Error(`未知 BLP2 编码 ${encoding}`);
  return image(out, width, height);
}
function tga(bytes: ArrayBuffer) {
  if (bytes.byteLength < 18) throw new Error('TGA 文件头不完整');
  const v = new DataView(bytes), src = new Uint8Array(bytes);
  const type = src[2], width = v.getUint16(12, true), height = v.getUint16(14, true), depth = src[16];
  dimensions(width, height);
  if (src[1] || ![2, 3, 10, 11].includes(type) || ![8, 24, 32].includes(depth) || ((type === 3 || type === 11) !== (depth === 8))) throw new Error(`不支持的 TGA 编码：类型 ${type} / ${depth} 位`);
  const stride = depth / 8, count = width * height, out = new Uint8Array(count * 4);
  let pos = 18 + src[0], pixel = 0;
  const next = () => { if (pos + stride > src.length) throw new Error('TGA 像素数据截断'); const p = pos; pos += stride; return stride === 1 ? [src[p], src[p], src[p], 255] : [src[p + 2], src[p + 1], src[p], stride === 4 ? src[p + 3] : 255]; };
  const put = (color: number[]) => { const x = pixel % width, y = Math.floor(pixel++ / width); out.set(color, (((src[17] & 32) ? y : height - y - 1) * width + ((src[17] & 16) ? width - x - 1 : x)) * 4); };
  while (pixel < count) {
    if (type < 10) put(next());
    else { if (pos >= src.length) throw new Error('TGA RLE 数据截断'); const packet = src[pos++], n = (packet & 127) + 1; if (pixel + n > count) throw new Error('TGA RLE 长度无效'); const color = packet & 128 ? next() : undefined; for (let j = 0; j < n; j++) put(color || next()); }
  }
  return image(out, width, height);
}
async function decode(bytes: ArrayBuffer, path: string, maxSize: number): Promise<ImageData[]> {
  const magic = new TextDecoder().decode(bytes.slice(0, 4));
  if (magic === 'BLX1') throw new Error('BLX1 特殊贴图格式：请在桌面版打开，桌面版会自动转换为标准 BLP。');
  if (magic === 'MHEB') throw new Error('MHEB 特殊贴图格式：请在新版桌面查看器打开；兼容的 ModelEncrypt v1 资源会自动转换。');
  if (magic === 'JRP1') throw new Error('JRP1 特殊贴图格式：请在新版桌面查看器打开；已兼容的 v1 密钥配置会自动转换。');
  if (magic === 'BLP2') return [blp2(bytes, maxSize)];
  if (magic === 'BLP1') { const decoded = decodeBLP(bytes); dimensions(decoded.width, decoded.height); let level = 0; while (level < decoded.mipmaps.length - 1 && Math.max(decoded.width, decoded.height) / 2 ** level > maxSize && decoded.mipmaps[level + 1]?.size) level++; const data = getBLPImageData(decoded, level); return [new ImageData(new Uint8ClampedArray(data.data), data.width, data.height)]; }
  if (magic === 'DDS ') {
    const info = parseHeaders(bytes); dimensions(info.shape.width, info.shape.height);
    if (info.format === 'ati2') throw new Error('DDS BC5 法线贴图暂不支持');
    const mip = info.images[0]; if (!mip || mip.offset + mip.length > bytes.byteLength) throw new Error('DDS 数据截断');
    return [image(decodeDds(new Uint8Array(bytes, mip.offset, mip.length), info.format, info.shape.width, info.shape.height), info.shape.width, info.shape.height)];
  }
  if (/\.tga$/i.test(path)) return [tga(bytes)];
  if (!/\.(png|jpe?g)$/i.test(path)) throw new Error(`未知贴图编码：${path}`);
  const bitmap = await createImageBitmap(new Blob([bytes]));
  try { dimensions(bitmap.width, bitmap.height); const { canvas, context } = raster(bitmap.width, bitmap.height); context.drawImage(bitmap, 0, 0); return [context.getImageData(0, 0, canvas.width, canvas.height)]; }
  finally { bitmap.close(); }
}
export async function decodeTexture(bytes: ArrayBuffer, path: string, maxSize = Infinity): Promise<ImageData[]> {
  const images = await decode(bytes, path, maxSize);
  return images.map(image => {
    const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
    if (ratio === 1) return image;
    const original = raster(image.width, image.height); original.context.putImageData(image, 0, 0);
    const { canvas, context } = raster(Math.max(1, Math.round(image.width * ratio)), Math.max(1, Math.round(image.height * ratio)));
    context.drawImage(original.canvas, 0, 0, canvas.width, canvas.height); return context.getImageData(0, 0, canvas.width, canvas.height);
  });
}
