import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ObjectColumn } from '../schema';
export function HeaderMenu({ x, y, column, hidden, canHide, change, close }: {
  x: number; y: number; column: ObjectColumn; hidden: ObjectColumn[]; canHide: boolean;
  change: (key: string, hide: boolean) => void; close: () => void;
}) {
  const root = useRef<HTMLDivElement>(null), [position, setPosition] = useState({ left: x, top: y }), [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => { const box = root.current!.getBoundingClientRect(); setPosition({ left: Math.max(4, Math.min(x, innerWidth - box.width - 4)), top: Math.max(4, Math.min(y, innerHeight - box.height - 4)) }); }, [x, y, expanded]);
  useEffect(() => { const outside = (e: Event) => { if (!root.current?.contains(e.target as Node)) close(); }; window.addEventListener('pointerdown', outside); return () => window.removeEventListener('pointerdown', outside); }, [close]);
  return createPortal(<div ref={root} role="menu" aria-label="表头菜单" className="ot-context-menu" style={position} onContextMenu={e => e.preventDefault()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Tab') close(); }}>
    <button role="menuitem" autoFocus disabled={!canHide} onClick={() => { change(column.key, true); close(); }}>隐藏此列 · {column.title || column.letter}</button>
    <div className="ot-header-submenu" onMouseEnter={() => setExpanded(true)}>
      <button role="menuitem" aria-haspopup="menu" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>查看隐藏表头　›</button>
      {expanded && <div role="menu" style={{ display: 'block' }}>{hidden.length ? hidden.map(c => <button key={c.key} role="menuitem" onClick={() => { change(c.key, false); close(); }}>{c.letter} · {c.title || '未命名'}</button>) : <button disabled>暂无隐藏列</button>}</div>}
    </div>
  </div>, document.body);
}
