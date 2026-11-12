import type { EditorDocument } from "../shared/types";
import { useLibrary } from "../assets/store";
import { renderFontText } from "../tools/services/fontText";
import { loadImage } from "../shared/image";

export async function rasterizeBatchText(document: EditorDocument, id: string) {
  const layer = document.layers.find((item) => item.id === id);
  if (!layer?.text) throw new Error("请选择需要替换的文字图层");
  const font = useLibrary
    .getState()
    .library.assets.find(
      (asset) => asset.kind === "font" && asset.id === layer.text!.fontId,
    );
  if (!font) throw new Error("文字图层的原字体不可用");
  const image = await renderFontText(
    font,
    layer.text.content,
    layer.text.fontSize,
    layer.text.color,
    layer.text,
  );
  const original = await loadImage(layer.imagePath);
  return {
    ...document,
    layers: document.layers.map((item) =>
      item.id === id
        ? {
            ...item,
            imagePath: image.imagePath,
            width: (image.width * item.width) / original.width,
            height: (image.height * item.height) / original.height,
          }
        : item,
    ),
  };
}
