import { useEffect, useRef, useState, type RefObject } from 'react';
import { resourceKey, type Source } from '../types';
import { useViewer } from '../workspace/store';

export interface SelectionBox { left: number; top: number; width: number; height: number }
export function useMarquee(host: RefObject<HTMLDivElement | null>, source: Source | undefined, active: boolean, context: string) {
  const [box, setBox] = useState<SelectionBox>();
  const dragging = useRef(false);
  useEffect(() => {
    const element = host.current;
    if (!element || !source || !active) return;
    let gesture: { id: number; x: number; y: number; clientX: number; clientY: number; before: string[]; additive: boolean; toggle: boolean; moved: boolean } | undefined;
    let raf = 0, suppressClick = false, clickTimer = 0;
    const update = () => {
      if (!gesture?.moved) return;
      const rect = element.getBoundingClientRect();
      const x = rect.left + gesture.x - element.scrollLeft, y = rect.top + gesture.y - element.scrollTop;
      const hitLeft = Math.min(x, gesture.clientX), hitTop = Math.min(y, gesture.clientY), hitRight = Math.max(x, gesture.clientX), hitBottom = Math.max(y, gesture.clientY);
      const left = Math.max(rect.left, hitLeft), top = Math.max(rect.top, hitTop);
      const right = Math.min(rect.right, hitRight), bottom = Math.min(rect.bottom, hitBottom);
      setBox({ left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) });
      const hits = Array.from(element.querySelectorAll<HTMLElement>('.viewer-card[data-path]')).filter(card => {
        const r = card.getBoundingClientRect();
        return r.right > hitLeft && r.left < hitRight && r.bottom > hitTop && r.top < hitBottom;
      }).map(card => resourceKey(source, card.dataset.path!));
      const before = gesture.before;
      useViewer.getState().patch({ selected: gesture.toggle ? [...before.filter(key => !hits.includes(key)), ...hits.filter(key => !before.includes(key))] : gesture.additive ? [...new Set([...before, ...hits])] : hits });
    };
    const scroll = () => {
      raf = 0;
      if (!gesture?.moved) return;
      const rect = element.getBoundingClientRect(), y = gesture.clientY;
      const speed = y < rect.top + 30 ? -Math.min(22, (rect.top + 30 - y) / 3) : y > rect.bottom - 30 ? Math.min(22, (y - rect.bottom + 30) / 3) : 0;
      if (speed) element.scrollTop += speed;
      update(); raf = requestAnimationFrame(scroll);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || gesture || useViewer.getState().fileBusy || (event.target as Element).closest('input,select,textarea,.viewer-card-footer button:last-child')) return;
      const rect = element.getBoundingClientRect();
      if (event.clientX >= rect.left + element.clientWidth || event.clientY >= rect.top + element.clientHeight) return;
      gesture = { id: event.pointerId, x: event.clientX - rect.left + element.scrollLeft, y: event.clientY - rect.top + element.scrollTop, clientX: event.clientX, clientY: event.clientY, before: [...useViewer.getState().selected], additive: event.shiftKey, toggle: event.ctrlKey || event.metaKey, moved: false };
    };
    const move = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      gesture.clientX = event.clientX; gesture.clientY = event.clientY;
      const rect = element.getBoundingClientRect();
      if (!gesture.moved && Math.hypot(event.clientX - rect.left + element.scrollLeft - gesture.x, event.clientY - rect.top + element.scrollTop - gesture.y) > 5) {
        gesture.moved = true; dragging.current = true; element.dataset.selecting = 'true';
        element.setPointerCapture(event.pointerId); raf = requestAnimationFrame(scroll);
      }
      if (gesture.moved) { event.preventDefault(); update(); }
    };
    const end = (cancel: boolean) => {
      if (!gesture) return;
      const current = gesture; gesture = undefined;
      if (cancel && current.moved) useViewer.getState().patch({ selected: current.before });
      if (current.moved) { suppressClick = true; clearTimeout(clickTimer); clickTimer = window.setTimeout(() => { suppressClick = false; }, 0); }
      if (element.hasPointerCapture(current.id)) element.releasePointerCapture(current.id);
      cancelAnimationFrame(raf); dragging.current = false; delete element.dataset.selecting; setBox(undefined);
    };
    const up = (event: PointerEvent) => { if (gesture?.id === event.pointerId) end(false); };
    const cancel = () => end(true);
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && gesture) { event.preventDefault(); cancel(); } };
    const click = (event: MouseEvent) => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); } };
    const nativeDrag = (event: DragEvent) => { if (gesture) event.preventDefault(); };
    element.addEventListener('pointerdown', down); element.addEventListener('lostpointercapture', cancel); element.addEventListener('click', click, true); element.addEventListener('dragstart', nativeDrag);
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel); window.addEventListener('keydown', key);
    return () => {
      end(true); clearTimeout(clickTimer);
      element.removeEventListener('pointerdown', down); element.removeEventListener('lostpointercapture', cancel); element.removeEventListener('click', click, true); element.removeEventListener('dragstart', nativeDrag);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key);
    };
  }, [host, source, active, context]);
  return { box, dragging };
}
