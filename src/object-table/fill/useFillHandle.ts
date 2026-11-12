import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { MAX_ROWS } from '../model';
import { bounds, HEADER_HEIGHT, type CellSelection } from '../grid/geometry';

/** Keep the drag on the grid root so virtualized cells may unmount during scrolling. */
export function useFillHandle(root: RefObject<HTMLDivElement | null>, scroll: RefObject<HTMLDivElement | null>, selection: CellSelection, apply: (selection: CellSelection, row: number) => void, rowAt: (offset: number) => number) {
  const [endRow, setEndRow] = useState<number | null>(null);
  const active = useRef<{ selection: CellSelection; row: number; y: number; pointer: number } | null>(null), commit = useRef(apply), tick = useRef<() => void>(() => {});
  commit.current = apply;
  const hitTest = useRef(rowAt); hitTest.current = rowAt;
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const drag = active.current, el = scroll.current;
      if (!drag) return;
      if (drag && el) {
        const box = el.getBoundingClientRect(), top = box.top + HEADER_HEIGHT;
        if (drag.y > box.bottom - 24) el.scrollTop += Math.min(28, Math.max(0, drag.y - box.bottom + 24));
        if (drag.y < top + 24) el.scrollTop -= Math.min(28, Math.max(0, top + 24 - drag.y));
        drag.row = Math.max(bounds(drag.selection).r2, Math.min(MAX_ROWS - 1, hitTest.current(Math.max(top, Math.min(drag.y, box.bottom - 1)) - box.top + el.scrollTop)));
        setEndRow(drag.row);
      }
      frame = requestAnimationFrame(update);
    };
    tick.current = update;
    const cancel = () => { cancelAnimationFrame(frame); const drag = active.current; active.current = null; setEndRow(null); if (drag && root.current?.hasPointerCapture(drag.pointer)) root.current.releasePointerCapture(drag.pointer); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    const move = (e: globalThis.PointerEvent) => { if (active.current) active.current.y = e.clientY; };
    const up = (e: globalThis.PointerEvent) => {
      const drag = active.current;
      if (!drag || drag.pointer !== e.pointerId) return;
      drag.y = e.clientY; cancelAnimationFrame(frame); update();
      const row = drag.row; cancel();
      if (row > bounds(drag.selection).r2) commit.current(drag.selection, row);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel); window.addEventListener('lostpointercapture', cancel); window.addEventListener('blur', cancel); window.addEventListener('keydown', key);
    return () => { cancel(); tick.current = () => {}; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('lostpointercapture', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key); };
  }, [root, scroll]);
  return { endRow, start: (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); root.current?.focus(); root.current?.setPointerCapture(e.pointerId);
    const row = bounds(selection).r2; active.current = { selection, row, y: e.clientY, pointer: e.pointerId }; setEndRow(row); tick.current();
  } };
}
