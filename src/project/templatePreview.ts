import { renderDocument } from "../export/render";
import { loadImage } from "../shared/image";
import type { EditorDocument } from "../shared/types";

export async function templatePreview(
  document: EditorDocument,
): Promise<string> {
  const blob = await renderDocument(document, "png");
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const scale = Math.min(320 / image.width, 320 / image.height, 1);
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
