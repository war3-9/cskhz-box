import { importImage, loadImage } from "../shared/image";

export async function prepareTestImage(file: File) {
  const asset = await importImage(file);
  return prepareAiImage(asset.imagePath);
}

export async function prepareAiImage(path: string) {
  const image = await loadImage(path);
  const scale = Math.min(1, 256 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
