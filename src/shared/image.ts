import type { Asset } from "./types";
import { isStoredImageUrl, storeImage } from '../assets/imageRepository';
import { imageDimensions } from '../assets/imageDimensions';
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片无法读取，请重新导入。"));
    image.src = src;
  });
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("文件读取失败。"));
    reader.readAsDataURL(blob);
  });
}
export async function importImage(file: File): Promise<Asset> {
  if (!["image/png", "image/jpeg"].includes(file.type) && !/\.(png|jpe?g)$/i.test(file.name))
    throw new Error("请选择 PNG 或 JPG 图片。");
  if (file.size > 20 * 1024 * 1024) throw new Error("单张图片不能超过 20 MB。");
  const dimensions = await imageDimensions(file);
  const scale = Math.min(1, 160 / Math.max(dimensions.width, dimensions.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(dimensions.width * scale));
  canvas.height = Math.max(1, Math.round(dimensions.height * scale));
  const bitmap = await createImageBitmap(file, { resizeWidth: canvas.width, resizeHeight: canvas.height, resizeQuality: 'high', imageOrientation: 'from-image' });
  let thumbnail: Blob;
  try {
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    thumbnail = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('缩略图生成失败。')), 'image/png'));
  } finally { bitmap.close(); canvas.width = canvas.height = 0; }
  const imagePath = await storeImage(new Blob([file], { type: dimensions.type }));
  const thumbnailPath = await storeImage(thumbnail);
  return {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, ""),
    source: "user",
    groupId: "",
    categoryId: "",
    imagePath,
    thumbnailPath,
    width: dimensions.width,
    height: dimensions.height,
  };
}
export async function embedImage(path: string): Promise<string> {
  if (/^data:image\/(png|jpeg);base64,/.test(path)) return path;
  if (isStoredImageUrl(path)) {
    const response = await fetch(path);
    if (!response.ok) throw new Error('原始素材读取失败。');
    return blobToDataUrl(await response.blob());
  }
  const image = await loadImage(path);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")!.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}
