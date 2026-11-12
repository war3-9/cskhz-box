import { useRef } from 'react';

export interface TextRange { start: number; end: number }
export function CustomTargetEditor({ seed, range, change }: { seed: string; range: TextRange | null; change: (range: TextRange) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null), parts = [...seed.matchAll(/\d+(?:\.\d+)?/g)];
  const choose = (next: TextRange) => { change(next); ref.current?.focus(); ref.current?.setSelectionRange(next.start, next.end); };
  return <div className="ot-custom-target">
    <label htmlFor="ot-fill-source">当前单元格原文（鼠标选中要变化的数字）</label>
    <textarea id="ot-fill-source" ref={ref} aria-label="自定义算法原文" readOnly value={seed} rows={3} onKeyDown={e => {
      // Windows readonly textareas do not consistently move the caret by keyboard.
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || e.altKey) return;
      e.preventDefault();
      const el = e.currentTarget, start = el.selectionStart, end = el.selectionEnd, backward = el.selectionDirection === 'backward';
      const anchor = backward ? end : start, focus = backward ? start : end;
      let next = focus;
      if (e.key === 'ArrowLeft') next = !e.shiftKey && end > start ? start : Math.max(0, focus - 1);
      if (e.key === 'ArrowRight') next = !e.shiftKey && end > start ? end : Math.min(seed.length, focus + 1);
      if (e.key === 'Home') next = e.ctrlKey || e.metaKey ? 0 : seed.lastIndexOf('\n', focus - 1) + 1;
      if (e.key === 'End') { const newline = seed.indexOf('\n', focus); next = e.ctrlKey || e.metaKey || newline < 0 ? seed.length : newline; }
      const low = e.shiftKey ? Math.min(anchor, next) : next, high = e.shiftKey ? Math.max(anchor, next) : next;
      el.setSelectionRange(low, high, e.shiftKey && next < anchor ? 'backward' : 'forward');
      if (high > low) change({ start: low, end: high });
    }} onSelect={e => {
      const { selectionStart: start, selectionEnd: end } = e.currentTarget;
      if (end > start) change({ start, end });
    }} />
    {parts.length > 0 && <div className="ot-number-choices" aria-label="原文中的数字">{parts.map((part, index) => <button type="button" className="ot-button" key={part.index} aria-label={`选择第${index + 1}段数字 ${part[0]}`} onClick={() => choose({ start: part.index, end: part.index + part[0].length })}>{part[0]}</button>)}</div>}
    <p className="ot-dialog-hint">可在原文中直接划选，也可点击上面的数字。选中 001 时会保留补零，其余文字保持原样。</p>
    {range && <div className="ot-custom-highlight" aria-label="变动位置预览">{seed.slice(0, range.start)}<mark>{seed.slice(range.start, range.end)}</mark>{seed.slice(range.end)}</div>}
  </div>;
}
