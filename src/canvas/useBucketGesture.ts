import type Konva from "konva";
import { PaintBucket } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { useEditor } from "../layers/store";
import { useCanvasInteraction } from "./interactionStore";
import { useBucket } from "./bucketStore";
import { addBucketFill } from "./bucketFill";
import { resolveHit } from "./alphaHit";

const icon = renderToStaticMarkup(
  createElement(PaintBucket, { size: 24, color: "#111111", fill: "white" }),
);
export const bucketCursor = `url("data:image/svg+xml,${encodeURIComponent(icon)}") 4 20, crosshair`;

export function useBucketGesture(
  stage: React.RefObject<Konva.Stage | null>,
  normal: (event: Konva.KonvaEventObject<MouseEvent>) => void,
) {
  return (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (
      !useBucket.getState().active ||
      useCanvasInteraction.getState().fixedId ||
      event.target.getParent()?.getClassName() === "Transformer"
    ) {
      normal(event);
      return;
    }
    if (event.evt.button !== 0) return;
    const current = stage.current;
    const pointer = current?.getPointerPosition();
    if (!current || !pointer) return;
    const point = current.getAbsoluteTransform().copy().invert().point(pointer);
    const { document } = useEditor.getState();
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x >= document.width ||
      point.y >= document.height
    )
      return;
    if (!resolveHit(document.layers, point)) addBucketFill();
  };
}
