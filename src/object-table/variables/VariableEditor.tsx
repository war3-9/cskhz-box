import { useState } from 'react';
import { ObjectModal } from '../dialogs/Modal';
import { validateVariable, type DraftVariable } from './model';
export function VariableEditor({ value, types, accept, close }: { value: DraftVariable; types: Record<string, string>; accept: (row: DraftVariable) => void; close: () => void }) {
  const [row, setRow] = useState(value), [error, setError] = useState('');
  return <ObjectModal title={value.original === null ? '新建地图变量' : '编辑地图变量'} close={close} className="ot-variable-edit">
    <form onSubmit={e => { e.preventDefault(); try { const next = { ...row, name: row.name.trim() }; validateVariable(next); accept(next); } catch (e) { setError(String(e)); } }}>
      <label>变量名<input data-autofocus value={row.name} onChange={e => setRow({ ...row, name: e.target.value })} /></label>
      <label>变量类型<select value={row.type} onChange={e => setRow({ ...row, type: e.target.value })}>{!types[row.type] && <option value={row.type}>{row.type}</option>}{Object.entries(types).map(([type, title]) => <option key={type} value={type}>{title} · {type}</option>)}</select></label>
      <div className="ot-variable-array"><label><input type="checkbox" checked={row.array} onChange={e => setRow({ ...row, array: e.target.checked, size: e.target.checked ? row.size : 1 })} />数组</label><label>数组大小<input type="number" min={1} max={8192} disabled={!row.array} value={row.size} onChange={e => setRow({ ...row, size: Number(e.target.value) })} /></label></div>
      <label className="ot-variable-check"><input type="checkbox" checked={row.initialized} onChange={e => setRow({ ...row, initialized: e.target.checked, initial: e.target.checked ? row.initial : '' })} />设置初始值</label>
      <label>初始值<input value={row.initial} disabled={!row.initialized} placeholder="使用编辑器变量窗口的初值格式" onChange={e => setRow({ ...row, initial: e.target.value })} /></label>
      <p className="ot-dialog-hint">变量名不需要 udg_。在全局变量窗口点“确定”后保存到工作簿。</p>
      {error && <p role="alert">{error}</p>}<footer><button type="button" className="ot-button" onClick={close}>取消</button><button className="ot-button primary" type="submit">确定</button></footer>
    </form>
  </ObjectModal>;
}
