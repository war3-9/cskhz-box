import { Expand } from "lucide-react";
import type { ImageLayer } from "../../shared/types";
import { IconButton } from "../../shared/components/IconButton";
import { useLibrary } from "../../assets/store";
import { useEditor } from "../store";
import { fillLayerCanvas, isTextLayer } from "../fillCanvas";

export function LayerFillAction({ layer }: { layer: ImageLayer }) {
  const assets = useLibrary((state) => state.library.assets);
  const canvasCreated = useEditor((state) => state.document.canvasCreated);
  if (isTextLayer(layer, assets)) return null;
  return (
    <IconButton
      label={`铺满画布：${layer.name}`}
      disabled={layer.locked || canvasCreated === false}
      onClick={() => {
        useEditor.getState().select(layer.id);
        fillLayerCanvas(layer.id);
      }}
    >
      <Expand size={14} />
    </IconButton>
  );
}
