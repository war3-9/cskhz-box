import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useEditor } from '../store';

type Drop = { id: string; position: 'before' | 'after' };
type Gesture = { id: string; pointer: number; x: number; y: number; active: boolean; element: HTMLElement; document: ReturnType<typeof useEditor.getState>['document'] };
export function useLayerDrag() {
  const gesture = useRef<Gesture | null>(null), list = useRef<HTMLDivElement>(null);
  const point = useRef({ x: 0, y: 0 }), frame = useRef(0);
  const [dragId, setDragId] = useState(''), [drop, setDrop] = useState<Drop | null>(null);
  const hit = (): Drop | null => {
    const row = document.elementFromPoint(point.current.x, point.current.y)?.closest<HTMLElement>('.layer-row');
    if (!row || !list.current?.contains(row) || !row.dataset.layerId || row.dataset.layerId === gesture.current?.id) return null;
    const rect = row.getBoundingClientRect(), position = point.current.y < rect.top + rect.height / 2 ? 'before' : 'after';
    const layer = useEditor.getState().document.layers.find(item => item.id === row.dataset.layerId);
    return !layer || (layer.kind === 'base' && position === 'after') ? null : { id: layer.id, position };
  };
  const cancel = () => {
    const current = gesture.current; gesture.current = null;
    cancelAnimationFrame(frame.current);
    if (current?.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer);
    setDragId(''); setDrop(null);
  };
  const scroll = () => {
    if (!gesture.current?.active) return;
    const host = list.current, p = point.current, rect = host?.getBoundingClientRect();
    if (host && rect && p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom) {
      host.scrollTop += p.y < rect.top + 25 ? -8 : p.y > rect.bottom - 25 ? 8 : 0;
      setDrop(hit());
    }
    frame.current = requestAnimationFrame(scroll);
  };
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const current = gesture.current;
      if (!current || current.pointer !== event.pointerId) return;
      if (!(event.buttons & 1) || useEditor.getState().document !== current.document) { cancel(); return; }
      point.current = { x: event.clientX, y: event.clientY };
      if (!current.active && Math.hypot(current.x - event.clientX, current.y - event.clientY) < 5) return;
      event.preventDefault();
      if (!current.active) { current.active = true; setDragId(current.id); frame.current = requestAnimationFrame(scroll); }
      setDrop(hit());
    };
    const up = (event: globalThis.PointerEvent) => {
      const current = gesture.current;
      if (!current || current.pointer !== event.pointerId) return;
      point.current = { x: event.clientX, y: event.clientY };
      const next = current.active && useEditor.getState().document === current.document ? hit() : null;
      cancel();
      if (next) useEditor.getState().moveLayer(current.id, next.id, next.position);
    };
    const abort = (event: globalThis.PointerEvent) => { if (event.pointerId === gesture.current?.pointer) cancel(); };
    const key = (event: KeyboardEvent) => { if (gesture.current && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); } };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', abort); window.addEventListener('lostpointercapture', abort);
    window.addEventListener('blur', cancel); window.addEventListener('keydown', key, true);
    return () => {
      cancel(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', abort); window.removeEventListener('lostpointercapture', abort);
      window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key, true);
    };
  }, []);
  const start = (event: PointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const state = useEditor.getState(), layer = state.document.layers.find(item => item.id === id);
    if (!layer || layer.locked || layer.kind === 'base') return;
    event.preventDefault(); cancel(); state.select(id);
    point.current = { x: event.clientX, y: event.clientY };
    gesture.current = { id, pointer: event.pointerId, ...point.current, active: false, element: event.currentTarget, document: state.document };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  return { list, dragId, drop, start };
}
