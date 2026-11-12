import { useEffect, useRef } from "react";
import type Konva from "konva";
import type { ImageLayer } from "../shared/types";
import { useEditor } from "../layers/store";
import { constrainNode } from "./constrainNode";
import { useCanvasInteraction } from "./interactionStore";
import { useFeatureActive } from '../app/FeatureActivity';

export function useImageTransform(
  ref: React.RefObject<Konva.Image | null>,
  layer: ImageLayer,
) {
  const original = useRef<ImageLayer | null>(null);
  const cancelled = useRef(false);
  const active = useFeatureActive();
  useEffect(() => {
    if (!active) return;
    const cancel = () => {
      const before = original.current;
      const node = ref.current;
      if (!before || !node) return;
      cancelled.current = true;
      original.current = null;
      const transformer = node.getStage()?.findOne("Transformer") as
        Konva.Transformer | undefined;
      transformer?.stopTransform();
      node.position({ x: before.x, y: before.y });
      node.size({ width: before.width, height: before.height });
      node.offset({ x: before.width / 2, y: before.height / 2 });
      node.rotation(before.rotation);
      node.scale({ x: 1, y: 1 });
      transformer?.forceUpdate();
      node.getStage()?.batchDraw();
      useCanvasInteraction.getState().setOperating(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    const unsubscribe = useEditor.subscribe((next) => {
      if (!original.current) return;
      const current = next.document.layers.find((item) => item.id === layer.id);
      if (next.selectedId !== layer.id || !current?.visible || current.locked)
        cancel();
    });
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    return () => {
      cancel();
      unsubscribe();
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
    };
  }, [ref, layer.id, active]);
  return {
    onTransformStart: () => {
      original.current = layer;
      cancelled.current = false;
      useCanvasInteraction.getState().setOperating(true);
    },
    onTransform: () => constrainNode(ref.current!, layer),
    onTransformEnd: () => {
      if (cancelled.current) return;
      original.current = null;
      const node = ref.current!;
      const patch = constrainNode(node, layer);
      node.scale({ x: 1, y: 1 });
      node.size({ width: patch.width, height: patch.height });
      node.offset({ x: patch.width / 2, y: patch.height / 2 });
      useEditor.getState().updateLayer(layer.id, patch);
      useCanvasInteraction.getState().touch();
      useCanvasInteraction.getState().setOperating(false);
    },
  };
}
