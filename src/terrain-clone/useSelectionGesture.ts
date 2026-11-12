import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, RefObject } from 'react';
import type { TerrainMapInfo, TerrainSelection } from './types';
import { boundsFromMask, clampPlacement, contains, hitHandle, moveSelection, paint, placementRect, resizeSelection } from './selectionGeometry';
import type { Handle, Point, Transform } from './selectionGeometry';

export interface GestureProps {
  side: 'source' | 'target'; map: TerrainMapInfo | null;
  mode: 'rectangle' | 'paint'; brush: number; shape: 'square' | 'circle'; eraser: boolean;
  selection: TerrainSelection | null; placement: Point | null; disabled: boolean;
  sourceSize?: Point;
  onSelection: (value: TerrainSelection | null) => void;
  onPlacement: (value: Point) => void; onOpen: () => void;
}
interface Drag { start: Point; screen: Point; kind: 'pan' | 'new' | 'move' | 'resize' | 'paint' | 'place'; rect?: TerrainSelection; targetRect?: TerrainSelection; handle?: Handle; mask?: boolean[] }

export function useSelectionGesture(props: GestureProps, canvas: RefObject<HTMLCanvasElement | null>, transform: Transform | null, setPan: (update: (pan: Point) => Point) => void, active: boolean) {
  const drag = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<TerrainSelection | null>(null);
  const [draftPlacement, setDraftPlacement] = useState<Point | null>(null);
  const [cursor, setCursor] = useState('crosshair');
  const cancel = () => { drag.current = null; setDraft(null); setDraftPlacement(null); };
  useEffect(() => {
    cancel();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('keydown', key); window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', cancel); };
  }, [props.map?.id, props.mode, active, props.disabled]);

  const coordinates = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canvas.current || !transform || !props.map) return null;
    const box = canvas.current.getBoundingClientRect();
    const screen: Point = [event.clientX - box.left, event.clientY - box.top];
    const point: Point = [Math.floor((screen[0] - transform.left) / transform.scale), Math.floor((screen[1] - transform.top) / transform.scale)];
    const inside = point[0] >= 0 && point[1] >= 0 && point[0] < props.map.width && point[1] < props.map.height;
    return { screen, point, inside };
  };
  const pointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!active || props.disabled || ![0, 2].includes(event.button)) return;
    if (!props.map) { props.onOpen(); return; }
    const coords = coordinates(event);
    if (!coords || !transform) return;
    const { screen, point, inside } = coords;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.button === 2) { drag.current = { start: point, screen, kind: 'pan' }; setCursor('grabbing'); return; }
    if (props.side === 'target') {
      if (!props.selection) return;
      const rect = placementRect(props.selection, props.placement);
      const handle = rect && !props.selection.mask ? hitHandle(rect, screen, transform) : null;
      if (rect && handle) {
        drag.current = { start: point, screen, kind: 'resize', rect: props.selection, targetRect: rect, handle };
        setDraft(props.selection); setDraftPlacement([rect.x0, rect.y0]); return;
      }
      if (!inside) return;
      const offset: Point = rect && contains(rect, point) ? [point[0] - rect.x0, point[1] - rect.y0] : [0, 0];
      const initial = clampPlacement([point[0] - offset[0], point[1] - offset[1]], props.selection, props.map);
      drag.current = { start: point, screen, kind: 'place', targetRect: placementRect(props.selection, initial)! };
      setDraftPlacement(initial);
    } else if (props.mode === 'paint' && inside) {
      const mask = props.selection?.mask ? [...props.selection.mask] : Array(props.map.width * props.map.height).fill(false);
      paint(mask, props.map.width, props.map.height, point, props.brush, props.shape, event.ctrlKey || props.eraser);
      drag.current = { start: point, screen, kind: 'paint', mask };
      setDraft(boundsFromMask(mask, props.map.width, props.map.height));
    } else {
      const rect = props.selection;
      const handle = rect && !rect.mask ? hitHandle(rect, screen, transform) : null;
      if (handle && rect) { drag.current = { start: point, screen, kind: 'resize', rect, handle }; setDraft(rect); }
      else if (inside && rect && !rect.mask && contains(rect, point)) { drag.current = { start: point, screen, kind: 'move', rect }; setDraft(rect); setCursor('move'); }
      else if (inside) { drag.current = { start: point, screen, kind: 'new' }; setDraft({ x0: point[0], y0: point[1], x1: point[0], y1: point[1], mask: null }); }
    }
  };
  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const coords = coordinates(event), current = drag.current;
    if (!coords || !props.map || !transform || props.disabled) return;
    const { point, screen } = coords;
    if (!current) {
      const rect = props.side === 'source' ? props.selection : placementRect(props.selection, props.placement);
      const handle = props.mode === 'rectangle' && props.side === 'source' && rect && !props.selection?.mask ? hitHandle(rect, screen, transform) : null;
      const cursors: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
      setCursor(handle ? cursors[handle] : rect && !rect.mask && contains(rect, point) ? 'move' : 'crosshair'); return;
    }
    const delta: Point = [Math.round((screen[0] - current.screen[0]) / transform.scale), Math.round((screen[1] - current.screen[1]) / transform.scale)];
    if (current.kind === 'pan') {
      const dx = screen[0] - current.screen[0], dy = screen[1] - current.screen[1];
      setPan(([x, y]) => [x + dx, y + dy]); current.screen = screen;
    } else if (current.kind === 'place') {
      setDraftPlacement(clampPlacement([current.targetRect!.x0 + delta[0], current.targetRect!.y0 + delta[1]], props.selection, props.map));
    } else if (current.kind === 'move') setDraft(moveSelection(current.rect!, delta, props.map.width, props.map.height));
    else if (current.kind === 'resize') {
      const source = current.rect!, target = current.targetRect;
      if (!target) setDraft(resizeSelection(source, current.handle!, delta, props.map.width, props.map.height));
      else {
        const handle = current.handle!;
        const bounded: Point = [
          handle.includes('w') ? Math.max(-target.x0, delta[0]) : Math.min(props.map.width - 1 - target.x1, delta[0]),
          handle.includes('n') ? Math.max(-target.y0, delta[1]) : Math.min(props.map.height - 1 - target.y1, delta[1]),
        ];
        // Source boundaries also limit how far the shared selection can grow.
        const next = resizeSelection(source, current.handle!, bounded, props.sourceSize![0], props.sourceSize![1]);
        setDraft(next); setDraftPlacement([target.x0 + next.x0 - source.x0, target.y0 + next.y0 - source.y0]);
      }
    }
    else if (current.kind === 'paint') {
      paint(current.mask!, props.map.width, props.map.height, point, props.brush, props.shape, event.ctrlKey || props.eraser);
      setDraft(boundsFromMask(current.mask!, props.map.width, props.map.height));
    } else {
      const x = Math.max(0, Math.min(props.map.width - 1, point[0])), y = Math.max(0, Math.min(props.map.height - 1, point[1]));
      setDraft({ x0: Math.min(current.start[0], x), y0: Math.min(current.start[1], y), x1: Math.max(current.start[0], x), y1: Math.max(current.start[1], y), mask: null });
    }
  };
  const pointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (current?.kind === 'place' && draftPlacement) props.onPlacement(draftPlacement);
    else if (current && current.kind !== 'pan' && current.kind !== 'place') {
      props.onSelection(draft);
      if (current.targetRect && draftPlacement) props.onPlacement(draftPlacement);
    }
    cancel();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return { draft, draftPlacement, cursor, pointerDown, pointerMove, pointerUp, cancel, dragging: drag.current !== null };
}
