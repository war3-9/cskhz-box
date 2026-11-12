import { useState } from 'react';
import { ObjectModal } from '../dialogs/Modal';
import { validateVariable, type DraftVariable } from './model';
export function ReplaceVariables({ rows, types, accept, close }: { rows: DraftVariable[]; types: Record<string, string>; accept: (rows: DraftVariable[]) => void; close: () => void }) {
  const [field, setField] = useState<'name' | 'type'>('name'), [source, setSource] = useState(''), [target, setTarget] = useState(''), [error, setError] = useState('');
  return <ObjectModal title="批量替换地图变量" close={close} className="ot-variable-edit"><form onSubmit={e => {
    e.preventDefault();
    try {
      if (!source) throw new Error('请填写查找内容。');
      const pattern = new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const next = rows.map(row => ({ ...row, [field]: field === 'name' ? row.name.replace(pattern, () => target) : row.type === source ? target : row.type }));
      const names = new Set<string>();
      for (const row of next) { validateVariable(row); if (names.has(row.name.toLowerCase())) throw new Error(`替换后出现重复变量名：${row.name}`); names.add(row.name.toLowerCase()); }
      accept(next);
    } catch (e) { setError(String(e)); }
  }}>
    <label>替换范围<select value={field} onChange={e => { setField(e.target.value as 'name' | 'type'); setSource(''); setTarget(''); }}><option value="name">变量名</option><option value="type">变量类型</option></select></label>
    {(['查找内容', '替换为'] as const).map((label, i) => <label key={label}>{label}{field === 'name' ? <input value={i ? target : source} onChange={e => (i ? setTarget : setSource)(e.target.value)} /> : <select value={i ? target : source} onChange={e => (i ? setTarget : setSource)(e.target.value)}><option value="">请选择类型</option>{Object.entries({ ...Object.fromEntries(rows.map(r => [r.type, r.type])), ...types }).map(([value, title]) => <option key={value} value={value}>{title} · {value}</option>)}</select>}</label>)}
    <p className="ot-dialog-hint">名称按片段替换，不区分大小写。修改在全局变量窗口点“确定”后一起同步。</p>{error && <p role="alert">{error}</p>}
    <footer><button type="button" className="ot-button" onClick={close}>取消</button><button type="submit" className="ot-button primary">全部替换</button></footer>
  </form></ObjectModal>;
}
