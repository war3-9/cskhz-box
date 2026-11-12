import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export function CategorySubmenu({ names, anchor, keyboard, dismiss, assign, create, id }: {
  names: string[]; anchor: RefObject<HTMLButtonElement | null>; keyboard: boolean; id: string;
  dismiss: () => void; assign: (name: string) => void; create: () => void;
}) {
  const root = useRef<HTMLDivElement>(null), [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const trigger = anchor.current?.getBoundingClientRect(), box = root.current?.getBoundingClientRect();
    if (!trigger || !box) return;
    const right = trigger.right + 2, left = right + box.width <= innerWidth - 8 ? right : trigger.left - box.width - 2;
    setPosition({ left: Math.max(8, Math.min(left, innerWidth - box.width - 8)), top: Math.max(8, Math.min(trigger.top, innerHeight - box.height - 8)) });
    if (keyboard) root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [anchor, keyboard, names.length]);
  return createPortal(<div ref={root} id={id} data-viewer-category-submenu={id} className="viewer-context-menu viewer-category-submenu" role="menu" aria-label="添加分类" style={position} onContextMenu={e => e.preventDefault()} onKeyDown={e => {
    e.stopPropagation();
    if (e.key === 'ArrowLeft' || e.key === 'Escape') { e.preventDefault(); dismiss(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')], index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
  }}>
    {names.length ? names.map(name => <button key={name} role="menuitem" title={name} onClick={() => assign(name)}>{name}</button>) : <small>暂无分类</small>}
    <hr /><button role="menuitem" onClick={() => assign('')}>移出分类</button><button role="menuitem" onClick={create}>新建分类…</button>
  </div>, document.body);
}
