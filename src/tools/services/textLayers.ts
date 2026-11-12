import type { Asset, ImageLayer, TextLayerData } from "../../shared/types";
import { loadImage } from "../../shared/image";
import { useEditor } from "../../layers/store";
import { renderFontText } from "./fontText";

export function textFont(layer: ImageLayer, fonts: Asset[]) {
  if (layer.text) return fonts.find((font) => font.id === layer.text!.fontId);
  return fonts.find((font) => layer.name.startsWith(`${font.name} · `));
}

export async function legacyTextSettings(
  layer: ImageLayer,
  font: Asset,
): Promise<TextLayerData> {
  const image = await loadImage(layer.imagePath);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let strongest = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > pixels[strongest + 3]) strongest = index - 3;
    if (pixels[index] === 255) {
      strongest = index - 3;
      break;
    }
  }
  const color = `#${[0, 1, 2].map((channel) => pixels[strongest + channel].toString(16).padStart(2, "0")).join("")}`;
  return {
    fontId: font.id,
    content: layer.name.slice(font.name.length + 3),
    fontSize: Math.max(8, Math.min(256, Math.round((image.height - 16) / 1.3))),
    color,
  };
}

export async function saveTextLayer(
  font: Asset,
  settings: TextLayerData,
  layerId?: string,
) {
  const image = await renderFontText(
    font,
    settings.content,
    settings.fontSize,
    settings.color,
    settings,
  );
  const editor = useEditor.getState();
  if (layerId) {
    const current = editor.document.layers.find(
      (layer) => layer.id === layerId,
    );
    if (!current || current.locked) throw new Error("图层已删除或锁定");
    const original = await loadImage(current.imagePath);
    // Rendering text must preserve the layer's saved name, including old projects.
    editor.updateLayer(layerId, {
      imagePath: image.imagePath,
      width: (image.width * current.width) / original.width,
      height: (image.height * current.height) / original.height,
      text: settings,
    });
  } else {
    editor.addAsset(
      {
        ...font,
        ...image,
        id: crypto.randomUUID(),
        name: `${font.name} · ${settings.content.slice(0, 20)}`,
        kind: "image",
        fontData: undefined,
        webFontData: undefined,
      },
      { x: editor.document.width / 2, y: editor.document.height / 2 },
      settings,
    );
  }
}
