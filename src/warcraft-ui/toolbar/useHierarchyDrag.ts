import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { descendants } from '../document/relations';
import type { DropPosition } from '../document/hierarchy';
import { useLayoutStore } from '../state/layout';

type Drop = { id: string | null; position: DropPosition };
type Gesture = { id: string; pointer: number; x: number; y: number; active: boolean; element: HTMLElement };

export function useHierarchyDrag(root: RefObject<HTMLElement | null>, expand: (id: string) => void) {
  const gesture = useRef<Gesture | null>(null), point = useRef({ x: 0, y: 0 });
  const expandRef = useRef(expand); expandRef.current = expand;
  const frame = useRef(0);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const hit = () => {
    const current = gesture.current, element = document.elementFromPoint(point.current.x, point.current.y);
    if (!current || !element || !root.current?.contains(element)) return null;
    if (element.closest('.clear-parent')) return { id: null, position: 'inside' } satisfies Drop;
    const row = element.closest<HTMLElement>('.tree-row'), id = row?.dataset.dropId;
    const nodes = useLayoutStore.getState().nodes;
    if (!row || !id || id === current.id || !nodes.some(n => n.id === id) || descendants(nodes, current.id).has(id)) return null;
    const rect = row.getBoundingClientRect(), y = point.current.y - rect.top, edge = Math.min(6, rect.height * .2);
    return { id, position: y < edge ? 'before' : y > rect.height - edge ? 'after' : 'inside' } satisfies Drop;
  };
  const updateTarget = () => {
    const next = hit();
    setDrop(previous => previous?.id === next?.id && previous?.position === next?.position ? previous : next);
  };
  const cancel = () => {
    const current = gesture.current; gesture.current = null;
    cancelAnimationFrame(frame.current);
    if (current?.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer);
    setDrag(null); setDrop(null);
  };
  const scroll = () => {
    if (!gesture.current?.active) return;
    const list = root.current?.querySelector<HTMLElement>('.element-list'), p = point.current;
    if (list) {
      const r = list.getBoundingClientRect();
      if (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) {
        const delta = p.y < r.top + 30 ? -12 : p.y > r.bottom - 30 ? 12 : 0;
        if (delta) { list.scrollTop += delta; updateTarget(); }
      }
    }
    frame.current = requestAnimationFrame(scroll);
  };
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointer) return;
      if (!(event.buttons & 1)) { cancel(); return; }
      point.current = { x: event.clientX, y: event.clientY };
      if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) return;
      event.preventDefault();
      if (!current.active) { current.active = true; frame.current = requestAnimationFrame(scroll); }
      setDrag({ id: current.id, ...point.current }); updateTarget();
    };
    const up = (event: globalThis.PointerEvent) => {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointer) return;
      point.current = { x: event.clientX, y: event.clientY };
      const next = current.active ? hit() : null;
      cancel();
      if (next) {
        useLayoutStore.getState().moveTree(current.id, next.id, next.position);
        if (next.id && next.position === 'inside') expandRef.current(next.id);
      }
    };
    const abort = (event: globalThis.PointerEvent) => { if (event.pointerId === gesture.current?.pointer) cancel(); };
    const escape = (event: KeyboardEvent) => {
      if (gesture.current && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', abort);
    window.addEventListener('lostpointercapture', abort);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape, true);
    return () => {
      cancel();
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', abort); window.removeEventListener('lostpointercapture', abort);
      window.removeEventListener('blur', cancel); window.removeEventListener('keydown', escape, true);
    };
  }, []);
  const start = (event: PointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || !event.isPrimary || (event.target as Element).closest('.tree-toggle')) return;
    const node = useLayoutStore.getState().nodes.find(n => n.id === id);
    if (!node || node.locked) return;
    event.preventDefault(); cancel(); useLayoutStore.getState().select(id);
    point.current = { x: event.clientX, y: event.clientY };
    gesture.current = { id, pointer: event.pointerId, ...point.current, active: false, element: event.currentTarget };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  return { drag, drop, start };
}
