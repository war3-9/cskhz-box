import { decodeTexture } from '../model-viewer/resources/textures';

export async function consoleImage(bytes: ArrayBuffer, filename: string): Promise<string> {
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('单张贴图不能超过 20 MB。');
  const [image] = await decodeTexture(bytes, filename);
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法读取贴图像素');
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
