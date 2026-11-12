import type { ImageLayer } from "../../shared/types";
import { blendModeSchema, layerEffectsSchema } from "../styles/schema";

export function validateLayer(layer: ImageLayer): ImageLayer {
  if (
    ![layer.x, layer.y, layer.width, layer.height, layer.rotation].every(
      Number.isFinite,
    ) ||
    layer.width <= 0 ||
    layer.height <= 0
  )
    throw new Error("图层变换参数无效");
  if (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)
    throw new Error("图层透明度无效");
  if (layer.effects) layerEffectsSchema.parse(layer.effects);
  if (layer.blendMode) blendModeSchema.parse(layer.blendMode);
  return layer;
}
