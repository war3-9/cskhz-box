import { useEffect, useRef } from "react";
import type Konva from "konva";
import { useEditor } from "../layers/store";
import { resolveHit } from "./alphaHit";
import { useCanvasInteraction } from "./interactionStore";
import { useFeatureActive } from '../app/FeatureActivity';

export function useCanvasGestures(
  stage: React.RefObject<Konva.Stage | null>,
  nodes: React.RefObject<Map<string, Konva.Image>>,
  pan: boolean,
  beginPan: (event: MouseEvent) => void,
) {
  const activeFeature = useFeatureActive();
  const drag = useRef<{
    id: string;
    pointer: { x: number; y: number };
    x: number;
    y: number;
  } | null>(null);
  const position = () => {
    const current = stage.current;
    const point = current?.getPointerPosition();
    return current && point
      ? current.getAbsoluteTransform().copy().invert().point(point)
      : null;
  };
  useEffect(() => {
    if (!activeFeature) return;
    const restore = () => {
      if (!drag.current) return;
      const node = nodes.current.get(drag.current.id);
      node?.position({ x: drag.current.x, y: drag.current.y });
      node?.getLayer()?.batchDraw();
      drag.current = null;
      useCanvasInteraction.getState().setOperating(false);
    };
    const move = (event: MouseEvent) => {
      const active = drag.current;
      if (!active || !stage.current) return;
      stage.current.setPointersPositions(event);
      const point = position();
      const node = nodes.current.get(active.id);
      if (!point || !node) return;
      node.position({
        x: active.x + point.x - active.pointer.x,
        y: active.y + point.y - active.pointer.y,
      });
      node.getLayer()?.batchDraw();
    };
    const end = () => {
      const active = drag.current;
      if (!active) return;
      drag.current = null;
      const node = nodes.current.get(active.id);
      if (node) useEditor.getState().updateLayer(active.id, node.position());
      const interaction = useCanvasInteraction.getState();
      interaction.touch();
      interaction.setOperating(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") restore();
    };
    const unsubscribe = useEditor.subscribe((next) => {
      const layer = next.document.layers.find(
        (item) => item.id === drag.current?.id,
      );
      if (
        drag.current &&
        (!layer ||
          !layer.visible ||
          layer.locked ||
          next.selectedId !== layer.id)
      )
        restore();
    });
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", restore);
    return () => {
      restore();
      unsubscribe();
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", restore);
    };
  }, [nodes, stage, activeFeature]);

  return (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (event.evt.button !== 0) return;
    // Transformer anchors handle their own gestures; artwork pixels use one resolver.
    if (event.target.getParent()?.getClassName() === "Transformer") return;
    const interaction = useCanvasInteraction.getState();
    if (pan && !interaction.fixedId) {
      beginPan(event.evt);
      return;
    }
    const point = position();
    if (!point) return;
    const editor = useEditor.getState();
    if (
      interaction.fixedId &&
      !interaction.operating &&
      interaction.expiresAt <= Date.now()
    )
      interaction.clear();
    const fixedId = useCanvasInteraction.getState().fixedId;
    const layer = fixedId
      ? editor.document.layers.find(
          (item) => item.id === fixedId && item.visible && !item.locked,
        )
      : resolveHit(editor.document.layers, point);
    editor.select(layer?.id ?? null);
    if (!layer) {
      beginPan(event.evt);
      return;
    }
    const node = nodes.current.get(layer.id);
    if (layer.locked || !node) return;
    drag.current = { id: layer.id, pointer: point, x: node.x(), y: node.y() };
    useCanvasInteraction.getState().setOperating(true);
  };
}
