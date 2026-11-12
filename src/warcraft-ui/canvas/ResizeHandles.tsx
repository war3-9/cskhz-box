import { useLayoutEffect, useRef, type RefObject } from 'react';
import type Konva from 'konva';
import { Transformer } from 'react-konva';
import { useLayoutStore, type UiNode } from '../state/layout';
import { useLayoutGesture } from '../state/gesture';

export function ResizeHandles({ node, group, scale }: { node: UiNode; group: RefObject<Konva.Group | null>; scale: number }) {
  const transformer = useRef<Konva.Transformer>(null);
  useLayoutEffect(() => {
    const control = transformer.current, target = group.current;
    if (!control || !target) return;
    control.nodes([target]); control.getLayer()?.batchDraw();
    return () => {
      if (useLayoutGesture.getState().drag?.id === node.id) useLayoutGesture.getState().clear();
      control.stopTransform(); control.nodes([]);
    };
  }, [group, node.id]);
  useLayoutEffect(() => {
    transformer.current?.forceUpdate(); transformer.current?.moveToTop();
  }, [node.x, node.y, node.width, node.height]);
  return <Transformer ref={transformer} name={`resize-${node.id}`} rotateEnabled={false} flipEnabled={false} keepRatio={false}
    ignoreStroke borderStroke="#7facf6" borderStrokeWidth={1} anchorSize={10}
    anchorStroke="#7facf6" anchorFill="#f3f7ff" anchorStrokeWidth={1}
    boundBoxFunc={(before, after) => after.width < scale || after.height < scale ? before : after}
    onTransformStart={() => useLayoutGesture.getState().begin(useLayoutStore.getState().nodes, node.id)}
    onTransform={() => {
      const target = group.current;
      if (!target || !useLayoutGesture.getState().drag) return;
      const box = { x: Math.round(target.x()), y: Math.round(target.y()),
        width: Math.max(1, Math.round(target.width() * target.scaleX())), height: Math.max(1, Math.round(target.height() * target.scaleY())) };
      target.setAttrs({ ...box, scaleX: 1, scaleY: 1 });
      useLayoutGesture.getState().resize(box);
    }}
    onTransformEnd={() => {
      const gesture = useLayoutGesture.getState().drag, state = useLayoutStore.getState();
      if (gesture?.id === node.id && gesture.origin === state.nodes) {
        state.setNode(node.id, { x: gesture.x, y: gesture.y, width: gesture.width, height: gesture.height });
      }
      group.current?.scale({ x: 1, y: 1 }); useLayoutGesture.getState().clear();
    }} />;
}
