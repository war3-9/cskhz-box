import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function FloatingPanel({ title, children, close, className = '', storageKey }: { title: string; children: ReactNode; close: () => void; className?: string; storageKey?: string }) {
  const panel = useRef<HTMLElement>(null);
  const clamp = (p: { x: number; y: number }) => ({ x: Math.max(0, Math.min(window.innerWidth - (panel.current?.offsetWidth ?? 440) - 8, p.x)), y: Math.max(0, Math.min(window.innerHeight - (panel.current?.offsetHeight ?? 340) - 8, p.y)) });
  const [position, setPosition] = useState(() => {
    try { const p = storageKey && JSON.parse(localStorage.getItem(storageKey) ?? 'null'); if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return clamp(p); } catch { /* Use the default position. */ }
    return { x: Math.max(8, window.innerWidth - 470), y: 125 };
  });
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); }, []);
  useLayoutEffect(() => {
    const fit = () => setPosition(current => { const next = clamp(current); return next.x === current.x && next.y === current.y ? current : next; });
    fit(); const observer = new ResizeObserver(fit); if (panel.current) observer.observe(panel.current);
    window.addEventListener('resize', fit);
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); };
  }, []);
  const remember = () => { drag.current = null; if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(position)); } catch (error) { window.dispatchEvent(new CustomEvent('object-preference-error', { detail: `色板位置保存失败：${String(error)}` })); } } };
  return createPortal(<section ref={panel} role="dialog" aria-modal="false" aria-label={title} className={`ot-dialog ot-floating ${className}`} style={{ left: position.x, top: position.y }} onPointerDown={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') close(); }} onCopy={e => e.stopPropagation()} onCut={e => e.stopPropagation()} onPaste={e => e.stopPropagation()}>
    <header onPointerDown={e => { if ((e.target as HTMLElement).closest('button')) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX - position.x, y: e.clientY - position.y }; }} onPointerMove={e => { if (drag.current) setPosition(clamp({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })); }} onPointerUp={remember} onLostPointerCapture={remember}>{title}<button className="ot-window-close" aria-label="关闭弹窗" title="关闭弹窗" onClick={close}><X size={18} /></button></header>{children}
  </section>, document.body);
}
