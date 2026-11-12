import { useRef, useState } from 'react';
import type Konva from 'konva';
import { Rect, Line, Group } from 'react-konva';
import { stageSize, type UiNode, useLayoutStore } from '../state/layout';
import { useCanvasView } from './view';
import { useLayoutGesture } from '../state/gesture';
import { Appearance } from './Appearance';
import { ResizeHandles } from './ResizeHandles';
import { gridCells } from '../document/grid';

export function PreviewNode({ node, scale }: { node: UiNode; scale: number }) {
  const selected = useLayoutStore(state => state.selectedId === node.id);
  const select = useLayoutStore(state => state.select);
  const group = useRef<Konva.Group>(null);
  const view = useCanvasView();
  const [hovered, setHovered] = useState(false);
  return <>
    <Group ref={group} name={node.id} x={node.x} y={node.y} width={node.width} height={node.height} scaleX={1} scaleY={1} _useStrictMode
      opacity={node.opacity ?? 1} visible={node.visible !== false} draggable={node.locked !== true}
      onMouseDown={() => select(node.id)} onTouchStart={() => select(node.id)}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onDragStart={() => useLayoutGesture.getState().begin(useLayoutStore.getState().nodes, node.id)}
      onDragMove={event => {
        if (view.snap) event.target.position({ x: Math.round(event.target.x() / 24) * 24, y: Math.round(event.target.y() / 24) * 24 });
        useLayoutGesture.getState().move(Math.round(event.target.x()), Math.round(event.target.y()));
      }}
      onDragEnd={() => {
        const gesture = useLayoutGesture.getState().drag, state = useLayoutStore.getState();
        if (gesture?.id === node.id && gesture.origin === state.nodes) state.setNode(gesture.id, { x: gesture.x, y: gesture.y });
        useLayoutGesture.getState().clear();
      }}>
      {gridCells(node).map((cell, index) => <Group key={index} x={cell.x - node.x} y={cell.y - node.y}>
        <Rect width={node.width} height={node.height} fill="transparent" />
        <Group listening={false}><Appearance node={cell} /></Group>
      </Group>)}
    </Group>
    {((selected && view.selection) || (hovered && view.highlight)) && <Rect name={`selection-${node.id}`} x={node.x} y={node.y}
      width={node.width} height={node.height} stroke="#7facf6" strokeWidth={3} listening={false} />}
    {selected && view.guides && <>
      <Line name="guide-horizontal" points={[0, node.y + node.height / 2, stageSize.width, node.y + node.height / 2]} stroke="#b9995e" dash={[12, 12]} strokeWidth={1} listening={false} />
      <Line name="guide-vertical" points={[node.x + node.width / 2, 0, node.x + node.width / 2, stageSize.height]} stroke="#b9995e" dash={[12, 12]} strokeWidth={1} listening={false} />
    </>}
    {selected && view.selection && !node.locked && <ResizeHandles node={node} group={group} scale={scale} />}
  </>;
}
