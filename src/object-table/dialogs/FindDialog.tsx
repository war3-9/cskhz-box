import { StyledSelect } from '../../shared/components/StyledSelect';
import { useEffect, useRef, useState } from 'react';
import { FloatingPanel } from './FloatingPanel';
import { findObjectMatches, type FindScope } from '../find';
import { useObjectTable } from '../store';
import type { Cell } from '../grid/geometry';

export function FindDialog({ current, locate, close }: { current: Cell; locate: (cell: Cell) => void; close: () => void }) {
  const [query, setQuery] = useState(''), [replacement, setReplacement] = useState(''), [scope, setScope] = useState<FindScope>('all'), [message, setMessage] = useState('列名用于定位，替换只修改单元格内容（保留自定义 ID）。');
  const input = useRef<HTMLInputElement>(null), previous = useRef(''), state = useObjectTable();
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { previous.current = ''; }, [state.active, query, scope]);
  const next = () => {
    const sheet = state.sheets[state.active], matches = findObjectMatches(sheet, query, scope, state.active);
    if (!matches.length) { setMessage('未找到匹配的列名或单元格'); return; }
    const index = (matches.findIndex(m => `${m.kind}:${m.row}:${m.col}` === previous.current) + 1) % matches.length, match = matches[index];
    previous.current = `${match.kind}:${match.row}:${match.col}`; locate({ row: match.kind === 'column' ? current.row : match.row, col: match.col });
    setMessage(`${index + 1}/${matches.length}：${match.kind === 'column' ? '列名' : `第 ${match.row + 3} 行`} ${sheet.columns[match.col].title}`);
  };
  return <FloatingPanel title="查找替换" close={close} className="ot-find-dialog"><form onSubmit={e => { e.preventDefault(); next(); }}><label>查找<input ref={input} aria-label="查找" value={query} onChange={e => setQuery(e.target.value)} /></label><label>范围<StyledSelect aria-label="查找范围" value={scope} onChange={e => setScope(e.target.value as FindScope)}><option value="all">列名和单元格</option><option value="columns">仅列名</option><option value="cells">仅单元格</option></StyledSelect></label><label>替换为<input aria-label="替换为" value={replacement} onChange={e => setReplacement(e.target.value)} /></label><p role="status" className="ot-dialog-hint">{message}</p><button className="ot-button" type="submit">查找下一个</button><button className="ot-button" type="button" disabled={!query || scope === 'columns'} onClick={() => { const count = state.replaceAll(state.active, query, replacement); setMessage(`已替换 ${count} 个单元格；列名和自定义 ID 保持不变，可一次撤销。`); }}>全部替换</button></form></FloatingPanel>;
}
