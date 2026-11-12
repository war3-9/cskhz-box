import type { ImageLayer } from "../shared/types";

export interface AlphaMask {
  width: number;
  height: number;
  alpha: Uint8Array;
}
const masks = new Map<string, { mask: AlphaMask; users: number }>();

export function retainAlpha(source: string, image: HTMLImageElement) {
  const cached = masks.get(source);
  if (cached) {
    cached.users++;
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const alpha = new Uint8Array(canvas.width * canvas.height);
  for (let index = 0; index < alpha.length; index++)
    alpha[index] = pixels[index * 4 + 3];
  masks.set(source, {
    mask: { width: canvas.width, height: canvas.height, alpha },
    users: 1,
  });
}

export function releaseAlpha(source: string) {
  const cached = masks.get(source);
  if (cached && --cached.users === 0) masks.delete(source);
}

export function hitsPixel(
  layer: ImageLayer,
  point: { x: number; y: number },
  mask?: AlphaMask,
) {
  if (!mask || !layer.visible || layer.opacity <= 0) return false;
  const radians = (layer.rotation * Math.PI) / 180;
  const dx = point.x - layer.x;
  const dy = point.y - layer.y;
  const u =
    (dx * Math.cos(radians) + dy * Math.sin(radians)) / layer.width + 0.5;
  const v =
    (-dx * Math.sin(radians) + dy * Math.cos(radians)) / layer.height + 0.5;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
  return (
    mask.alpha[
      Math.floor(v * mask.height) * mask.width + Math.floor(u * mask.width)
    ] > 0
  );
}

export function resolveHit(
  layers: ImageLayer[],
  point: { x: number; y: number },
  lookup: (source: string) => AlphaMask | undefined = (source) =>
    masks.get(source)?.mask,
) {
  return [...layers]
    .reverse()
    .find((layer) => hitsPixel(layer, point, lookup(layer.imagePath)));
}
