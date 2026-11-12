import type Konva from "konva";
import type { ImageLayer } from "../shared/types";
import { validateLayer } from "../layers/utils/bounds";

export function constrainNode(node: Konva.Image, layer: ImageLayer) {
  const next = validateLayer({
    ...layer,
    x: node.x(),
    y: node.y(),
    width: Math.max(8, layer.width * node.scaleX()),
    height: Math.max(8, layer.height * node.scaleY()),
    rotation: node.rotation(),
  });
  node.position({ x: next.x, y: next.y });
  node.scale({ x: next.width / layer.width, y: next.height / layer.height });
  return next;
}
