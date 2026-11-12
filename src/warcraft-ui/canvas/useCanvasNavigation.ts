import { useEffect, useRef, type RefObject } from 'react';
import type Konva from 'konva';
import { useLayoutStore } from '../state/layout';
import { useUiTasks } from '../tasks/store';
import { useCanvasView } from './view';
import { wheelZoom, zoomAt } from './navigation';

export function useCanvasNavigation(container: RefObject<HTMLDivElement | null>, stage: RefObject<Konva.Stage | null>, scale: number) {
  const scaleRef = useRef(scale); scaleRef.current = scale;
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    let drag: { pointer: number; x: number; y: number; panX: number; panY: number; task: string | null; active: boolean } | null = null;
    const finish = (restore = false) => {
      const previous = drag; drag = null;
      host.classList.remove('canvas-panning');
      if (previous && host.hasPointerCapture(previous.pointer)) host.releasePointerCapture(previous.pointer);
      if (restore && previous && previous.task === useUiTasks.getState().activeId)
        useCanvasView.setState({ panX: previous.panX, panY: previous.panY });
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || drag) return;
      const canvas = stage.current, rect = canvas?.container().getBoundingClientRect();
      if (canvas && rect && canvas.getIntersection({ x: event.clientX - rect.left, y: event.clientY - rect.top })) return;
      event.preventDefault();
      useLayoutStore.getState().select(null);
      const { panX, panY } = useCanvasView.getState();
      drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, panX, panY, task: useUiTasks.getState().activeId, active: false };
      host.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.pointer !== event.pointerId) return;
      if (drag.task !== useUiTasks.getState().activeId || !(event.buttons & 1)) { finish(); return; }
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.active && Math.hypot(dx, dy) < 3) return;
      drag.active = true; event.preventDefault(); host.classList.add('canvas-panning');
      useCanvasView.setState({ panX: drag.panX + dx, panY: drag.panY + dy });
    };
    const up = (event: PointerEvent) => { if (event.pointerId === drag?.pointer) { move(event); finish(); } };
    const cancel = () => finish(true);
    const abort = (event: PointerEvent) => { if (event.pointerId === drag?.pointer) cancel(); };
    const key = (event: KeyboardEvent) => { if (drag && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); } };
    const wheel = (event: WheelEvent) => {
      if (useLayoutStore.getState().selectedId !== null) return;
      event.preventDefault();
      if (drag || event.deltaY === 0) return;
      const view = useCanvasView.getState(), current = view.zoom ?? scaleRef.current;
      const next = wheelZoom(current, event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host.clientHeight : 1));
      if (next === current) return;
      const rect = host.getBoundingClientRect();
      useCanvasView.setState(zoomAt(current, next, view.panX, view.panY,
        event.clientX - rect.left - host.clientLeft - host.clientWidth / 2,
        event.clientY - rect.top - host.clientTop - host.clientHeight / 2));
    };
    const unsubscribe = useUiTasks.subscribe((state, previous) => { if (state.activeId !== previous.activeId) finish(); });
    host.addEventListener('pointerdown', down); host.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', abort); host.addEventListener('lostpointercapture', abort);
    window.addEventListener('blur', cancel); window.addEventListener('keydown', key, true);
    return () => {
      finish(); unsubscribe();
      host.removeEventListener('pointerdown', down); host.removeEventListener('wheel', wheel);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', abort); host.removeEventListener('lostpointercapture', abort);
      window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key, true);
    };
  }, [container, stage]);
}
