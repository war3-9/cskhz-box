import type { Asset, ImageLayer } from "../shared/types";
import { useEditor } from "./store";
import { useLibrary } from "../assets/store";
import { textFont } from "../tools/services/textLayers";

export function isTextLayer(layer: ImageLayer, assets: Asset[]) {
  return Boolean(
    layer.text ||
    textFont(
      layer,
      assets.filter((asset) => asset.kind === "font"),
    ),
  );
}

export function fillLayerCanvas(id: string) {
  const editor = useEditor.getState();
  const { document } = editor;
  const layer = document.layers.find((item) => item.id === id);
  if (
    !layer ||
    layer.locked ||
    document.canvasCreated === false ||
    isTextLayer(layer, useLibrary.getState().library.assets)
  )
    return;
  editor.updateLayer(id, {
    x: document.width / 2,
    y: document.height / 2,
    width: document.width,
    height: document.height,
    rotation: 0,
  });
}
