import type { EditorDocument } from "../shared/types";
import { loadImage } from "../shared/image";
import { encodeCanvas } from "./encodeCanvas";
import type { BatchFormat } from "./batchConfig";
import type { EncodeOptions } from "./gameFormats/settings";
import { prepareLayer } from "../layers/styles/render/prepare";
export async function renderDocument(
  document: EditorDocument,
  format: BatchFormat,
  quality = 0.95,
  options: EncodeOptions = {},
): Promise<Blob> {
  return encodeCanvas(await renderDocumentCanvas(document, format === "jpeg"), format, quality, options);
}
export async function renderDocumentCanvas(document: EditorDocument, opaque = false): Promise<HTMLCanvasElement> {
  const canvas = window.document.createElement("canvas");
  canvas.width = document.width;
  canvas.height = document.height;
  const context = canvas.getContext("2d")!;
  if (opaque) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (const layer of document.layers) {
    if (!layer.visible || layer.opacity === 0) continue;
    const image = await loadImage(layer.imagePath);
    const prepared = prepareLayer(image, layer);
    context.save();
    context.globalAlpha = layer.opacity;
    context.globalCompositeOperation = layer.blendMode ?? "source-over";
    context.translate(layer.x, layer.y);
    context.rotate((layer.rotation * Math.PI) / 180);
    context.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
    context.drawImage(
      prepared.image,
      prepared.x - layer.width / 2,
      prepared.y - layer.height / 2,
      prepared.width,
      prepared.height,
    );
    context.restore();
  }
  return canvas;
}
