import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { ObjectColumn } from '../schema';

export function useColumnResize(columns: ObjectColumn[], commit: (key: string, width: number) => void) {
  const [preview, setPreview] = useState<{ key: string; width: number } | null>(null);
  const gesture = useRef<{ key: string; x: number; width: number; next: number } | null>(null);
  useEffect(() => {
    const cancel = () => { gesture.current = null; setPreview(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', key); window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', cancel); };
  }, []);
  const handle = (column: ObjectColumn) => ({
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); (e.currentTarget as HTMLElement).focus();
      gesture.current = { key: column.key, x: e.clientX, width: column.width, next: column.width };
    },
    onPointerMove: (e: PointerEvent) => {
      const g = gesture.current; if (!g) return;
      g.next = Math.round(Math.max(48, Math.min(4000, g.width + e.clientX - g.x))); setPreview({ key: g.key, width: g.next });
    },
    onPointerUp: () => {
      const g = gesture.current; gesture.current = null; setPreview(null); if (g) commit(g.key, g.next);
    },
    onLostPointerCapture: () => { gesture.current = null; setPreview(null); },
  });
  return { columns: preview ? columns.map(c => c.key === preview.key ? { ...c, width: preview.width } : c) : columns, handle };
}
