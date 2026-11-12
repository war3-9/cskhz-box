import { useEffect, useRef } from 'react';
export interface Editing { row: number; col: number; value: string; multiline: boolean }
export function GridEditor({ edit, change, finish }: { edit: Editing; change: (value: string) => void; finish: (save: boolean, direction?: number) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null), canceled = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.setSelectionRange(edit.value.length, edit.value.length); }, []);
  const input = <textarea ref={ref} aria-label="编辑单元格" value={edit.value} onChange={e => change(e.target.value)} onBlur={() => { if (!edit.multiline && !canceled.current) finish(true); }} onKeyDown={e => {
    e.stopPropagation(); if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); canceled.current = true; finish(false); }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !edit.multiline) || (e.key === 'Enter' && e.ctrlKey)) { e.preventDefault(); canceled.current = true; finish(true, e.key === 'Tab' ? e.shiftKey ? -2 : 2 : 1); }
  }} />;
  if (!edit.multiline) return input;
  return <div className="ot-modal-shade" onPointerDown={e => e.stopPropagation()}><section className="ot-long-editor" role="dialog" aria-label="多行文案编辑"><header>编辑文案 <small>保留 |n 换行和颜色标记 · Ctrl+Enter 保存</small></header>{input}<footer><button className="ot-button" onClick={() => finish(false)}>取消</button><button className="ot-button ot-primary" onClick={() => finish(true)}>保存</button></footer></section></div>;
}
