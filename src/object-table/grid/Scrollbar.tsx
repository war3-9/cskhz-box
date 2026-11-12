import { useRef } from 'react';
export function HorizontalScrollbar({ width, total, left, scroll }: { width: number; total: number; left: number; scroll: (value: number) => void }) {
  const drag = useRef<number | null>(null), thumb = Math.max(28, width * width / total), maximum = Math.max(0, total - width), travel = width - thumb;
  const update = (x: number, element: HTMLElement) => scroll(Math.max(0, Math.min(maximum, (x - element.getBoundingClientRect().left - (drag.current ?? thumb / 2)) / Math.max(1, travel) * maximum)));
  return <div className="ot-scroll-track" role="scrollbar" aria-label="拖动横向滚动条" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={Math.round(left)} tabIndex={0} style={{ width }}
    onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); scroll(e.key === 'Home' ? 0 : e.key === 'End' ? maximum : left + (e.key === 'ArrowLeft' ? -80 : 80)); } }}
    onPointerDown={e => { e.preventDefault(); const target = e.target as HTMLElement; drag.current = target.classList.contains('ot-scroll-thumb') ? e.clientX - target.getBoundingClientRect().left : thumb / 2; e.currentTarget.setPointerCapture(e.pointerId); update(e.clientX, e.currentTarget); }}
    onPointerMove={e => { if (drag.current !== null) update(e.clientX, e.currentTarget); }} onPointerUp={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
    <div className="ot-scroll-thumb" style={{ width: thumb, left: maximum ? Math.min(travel, left / maximum * travel) : 0 }} />
  </div>;
}
