import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type MenuAction = 'copy' | 'cut' | 'paste' | 'pasteValues' | 'add' | 'batch' | 'delete' | 'clear' | 'color' | 'template' | 'fill' | 'fillRule' | 'importIcon' | 'importModel';
export function GridContextMenu({ x, y, rows, localOnly = false, action, close }: { x: number; y: number; rows: number; localOnly?: boolean; action: (action: MenuAction) => void; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null), [position, setPosition] = useState({ x, y });
  useLayoutEffect(() => { const box = ref.current!.getBoundingClientRect(); setPosition({ x: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)) }); ref.current?.querySelector('button')?.focus(); }, [x, y]);
  useEffect(() => {
    const outside = (e: Event) => { if (!ref.current?.contains(e.target as Node)) close(); };
    window.addEventListener('pointerdown', outside); window.addEventListener('blur', close);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('blur', close); };
  }, [close]);
  const items: [MenuAction, string][] = [['copy', '复制（Ctrl+C）'], ['cut', '剪切（Ctrl+X）'], ['paste', '粘贴（Ctrl+V，保留公式）'], ['pasteValues', '粘贴为值（Ctrl+Shift+V）'], ['add', '添加一行'], ['batch', '批量添加'], ['delete', rows > 1 ? `批量删除选中行（${rows} 行）` : '删除选中行'], ['clear', '清空'], ...(!localOnly ? [['importIcon', '导入图标'], ['importModel', '导入模型']] as [MenuAction, string][] : []), ['fill', '向下填充'], ['fillRule', '本列填充算法'], ...(!localOnly ? [['template', '选择模板']] as [MenuAction, string][] : []), ['color', '文字调色 / 多行编辑']];
  return createPortal(<div ref={ref} role="menu" aria-label="物编表格右键菜单" className="ot-context-menu" style={{ left: position.x, top: position.y }} onContextMenu={e => e.preventDefault()} onKeyDown={e => {
    e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const buttons = [...ref.current!.querySelectorAll('button')], current = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(current + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus(); }
  }}>{items.map(([id, label]) => <button key={id} role="menuitem" onClick={() => action(id)}>{label}</button>)}</div>, document.body);
}

