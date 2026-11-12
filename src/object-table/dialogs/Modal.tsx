import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function ObjectModal({ title, children, close, className = '' }: { title: string; children: ReactNode; close: () => void; className?: string }) {
  const ref = useRef<HTMLElement>(null), cancel = useRef(close); cancel.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (ref.current?.querySelector('[data-autofocus]') as HTMLElement | null ?? ref.current?.querySelector<HTMLElement>('textarea,input,button'))?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className="ot-modal-shade" onPointerDown={e => e.stopPropagation()} onCopy={e => e.stopPropagation()} onCut={e => e.stopPropagation()} onPaste={e => e.stopPropagation()} onKeyDown={e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); cancel.current(); }
    if (e.key === 'Tab') {
      const elements = [...ref.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,[contenteditable="true"],[tabindex="0"]')];
      const first = elements[0], last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}><section ref={ref} className={`ot-dialog ${className}`} role="dialog" aria-modal="true" aria-label={title}><header>{title}<button className="ot-icon-button" aria-label="关闭弹窗" onClick={close}>×</button></header>{children}</section></div>, document.body);
}
