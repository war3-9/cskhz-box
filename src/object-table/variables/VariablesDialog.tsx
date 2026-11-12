import { useState } from 'react';
import { ObjectModal } from '../dialogs/Modal';
import { clean, same, variableTypes, type DraftVariable } from './model';
import { useVariables } from './useVariables';
import { VariableEditor } from './VariableEditor';
import { ReplaceVariables } from './ReplaceVariables';
import './variables.css';
export function VariablesDialog({ taskId, close }: { taskId: string; close: () => void }) {
  const [query, setQuery] = useState(''), [selected, setSelected] = useState<string[]>([]);
  const [editor, setEditor] = useState<{ value: DraftVariable; index: number } | null>(null), [replace, setReplace] = useState(false), [deleting, setDeleting] = useState(false);
  const state = useVariables(taskId);
  const [sort, setSort] = useState<{ field: 'name' | 'type'; direction: number } | null>(null);
  const shown = state.rows.map((row, index) => ({ row, index })).filter(({ row }) => row.name.toLowerCase().includes(query.toLowerCase()));
  if (sort) shown.sort((a, b) => a.row[sort.field].localeCompare(b.row[sort.field], 'zh-CN') * sort.direction);
  const one = selected.length === 1 ? state.rows.findIndex(r => r.name === selected[0]) : -1;
  const edit = (index: number) => { setEditor({ value: state.rows[index], index }); };
  return <ObjectModal title="全局变量" close={close} className="ot-variables-dialog">
    <div className="ot-variable-tab">工作簿全局变量</div>
    <div className="ot-variable-toolbar"><button className="ot-button" disabled={!state.canUndo} onClick={state.undo}>撤销变量</button><button className="ot-button" disabled={!state.canRedo} onClick={state.redo}>重做变量</button>
      <button className="ot-button" onClick={() => setEditor({ index: -1, value: { name: '', type: 'integer', array: false, size: 1, initial: '', initialized: false, original: null } })}>新建变量</button>
      <button className="ot-button" disabled={one < 0} onClick={() => edit(one)}>编辑变量</button>
      <button className="ot-button" disabled={!selected.length} onClick={() => setDeleting(true)}>删除变量</button>
      <button className="ot-button" disabled={!state.rows.length} onClick={() => setReplace(true)}>批量替换</button><span role="status">{state.dirty ? '草稿待确认' : '本地编辑'}</span></div>
    <p className="ot-dialog-hint">点击“确定”保存到当前工作簿；变量内容随工作簿一起保存与恢复。</p>
    {state.error && <p className="ot-variable-warning" role="alert">{state.error}</p>}
    <label className="ot-variable-search">查找变量名：<input placeholder="输入变量名或其中一部分" value={query} onChange={e => setQuery(e.target.value)} /><span>显示 {shown.length} / {state.rows.length}</span></label>
    <div className="ot-variable-table"><table><thead><tr><th aria-sort={sort?.field === 'name' ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button onClick={() => setSort({ field: 'name', direction: sort?.field === 'name' ? -sort.direction : 1 })}>变量名</button></th><th><button onClick={() => setSort({ field: 'type', direction: sort?.field === 'type' ? -sort.direction : 1 })}>变量类型</button></th><th>初始值</th><th>状态</th></tr></thead><tbody>{shown.map(({ row, index }) => {
      const old = state.base.find(v => v.name === row.original), status = row.original === null ? '新增' : same(old, clean(row)) ? '与来源一致' : '已修改';
      return <tr key={index} aria-selected={selected.includes(row.name)} onDoubleClick={() => edit(index)} onClick={e => setSelected(e.ctrlKey || e.metaKey ? selected.includes(row.name) ? selected.filter(s => s !== row.name) : [...selected, row.name] : [row.name])}>
        <td><label><input aria-label={`选择变量 ${row.name}`} type="checkbox" checked={selected.includes(row.name)} onClick={e => e.stopPropagation()} onChange={e => setSelected(e.target.checked ? [...selected, row.name] : selected.filter(s => s !== row.name))} />{row.name}</label></td><td>{state.types[row.type] ?? variableTypes[row.type] ?? row.type}{row.array ? ` 数组[${row.size}]` : ''}</td><td>{row.initialized ? row.initial || '空字符串' : '默认值'}</td><td>{status}</td></tr>;
    })}</tbody></table>{!shown.length && <p className="ot-dialog-hint">{state.rows.length ? '没有匹配的变量' : '当前工作簿没有全局变量'}</p>}</div>
    <footer><button className="ot-button" onClick={close}>取消</button><button className="ot-button primary" onClick={() => void state.save().then(ok => { if (ok) close(); })}>确定</button></footer>
    {editor && <VariableEditor value={editor.value} types={state.types} close={() => setEditor(null)} accept={row => {
      if (state.rows.some((r, i) => i !== editor.index && r.name.toLowerCase() === row.name.toLowerCase())) throw new Error(`变量名重复：${row.name}`);
      state.setRows(editor.index < 0 ? [...state.rows, row] : state.rows.map((r, i) => i === editor.index ? row : r)); setSelected([row.name]); setEditor(null);
    }} />}
    {replace && <ReplaceVariables rows={state.rows} types={state.types} close={() => setReplace(false)} accept={rows => { state.setRows(rows); setSelected([]); setReplace(false); }} />}
    {deleting && <ObjectModal title="删除工作簿变量" close={() => setDeleting(false)}><p>确定删除选中的 {selected.length} 个变量？点“确定”后保存到工作簿，可通过撤销变量恢复。</p><footer><button className="ot-button" onClick={() => setDeleting(false)}>取消</button><button className="ot-button" onClick={() => { state.setRows(state.rows.filter(r => !selected.includes(r.name))); setSelected([]); setDeleting(false); }}>删除</button></footer></ObjectModal>}
  </ObjectModal>;
}
