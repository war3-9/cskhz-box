import { useEffect, useMemo, useState } from 'react';
import { ObjectModal } from '../dialogs/Modal';
import { useObjectTasks, openObjectTask, updateObjectTask, pathIdentity, activateObjectTask } from '../tasks/store';
import { mapProject } from '../native/mapping';
import { applyTaskSnapshot, bindTask, customSnapshot, readObjectMap } from '../native/maps';
import { equal, operations, reconcile, type ConflictValue } from './reconcile';
import type { MapRead } from './types';
import { guardObjects } from '../files';
import { synchronizePaletteDraft } from '../palette/bridge';
import type { CategoryId } from '../schema';
import { commitObjectEditor } from '../commit';
import { compileTask } from '../native/taskCompiler';

const display = (value: ConflictValue) => value === undefined ? '（删除／默认值）' : typeof value === 'string' ? value : 'value' in value ? String(value.value) : `${value.id} ← ${value.parent}`;
export function MapDialog({ close, locate }: { close: () => void; locate: (category: CategoryId, row: number, col: number) => void }) {
  const activeId = useObjectTasks(s => s.activeId), tasks = useObjectTasks(s => s.tasks);
  const task = tasks.find(t => t.id === activeId), binding = task?.data.metadata?.binding;
  const [map, setMap] = useState<MapRead | null>(null), [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [choices, setChoices] = useState<Record<string, 'table' | 'editor'>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { setChoices({}); setSelected(new Set()); }, [task?.data.sheets]);
  const compiled = useMemo(() => task ? compileTask(task) : null, [task]);
  const source = useMemo(() => map ? customSnapshot(map, new Set(Object.keys(compiled?.objects ?? {}))) : {}, [map, compiled]);
  const originalReview = useMemo(() => reconcile(binding?.baseline ?? {}, compiled?.objects ?? {}, source, compiled?.formulas), [binding, compiled, source]);
  const review = useMemo(() => reconcile(binding?.baseline ?? {}, compiled?.objects ?? {}, source, compiled?.formulas, choices), [binding, compiled, source, choices]);
  const differences = useMemo(() => operations(compiled?.objects ?? {}, source), [compiled, source]);
  const listedMap = map ?? binding?.source;
  const load = async (existing: boolean, create: boolean) => {
    setBusy(true); setError('');
    const id = useObjectTasks.getState().activeId;
    try {
      await synchronizePaletteDraft(); commitObjectEditor();
      if (create && !await guardObjects()) return;
      const result = await readObjectMap(existing ? binding?.path : undefined); if (!result) return;
      if (create) {
        const same = useObjectTasks.getState().tasks.find(t => t.data.metadata?.binding && pathIdentity(t.data.metadata.binding.path) === pathIdentity(result.path));
        if (same) activateObjectTask(same.id); else openObjectTask(mapProject(result), null, false);
        close(); return;
      }
      if (id !== useObjectTasks.getState().activeId) throw new Error('活动任务已经变化，请重新读取');
      setMap(result); setTarget(id); setChoices({}); setSelected(new Set());
      if (binding && result.fingerprint !== binding.fingerprint) setError('地图文件已变化，可能已保存、替换或另存；请重新读取并核对。');
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const decide = (side: 'table' | 'editor', all = false) => setChoices(prev => ({ ...prev, ...Object.fromEntries(originalReview.conflicts.filter(c => all || selected.has(`${c.key}/${c.field}`)).map(c => [`${c.key}/${c.field}`, side])) }));
  const confirm = async () => {
    try {
      await synchronizePaletteDraft(); commitObjectEditor();
      const latest = useObjectTasks.getState().tasks.find(t => t.id === target);
      if (!map || !latest || target !== useObjectTasks.getState().activeId) throw new Error('目标任务变化，请重新核对');
      const current = compileTask(latest);
      if (current.issues.length) throw new Error('请先修正表格中的字段和 ID 错误');
      const checked = reconcile(latest.data.metadata?.binding?.baseline ?? {}, current.objects, customSnapshot(map, new Set(Object.keys(current.objects))), current.formulas, choices);
      if (checked.conflicts.length) throw new Error('请先逐项选择冲突处理方式');
      const owner = useObjectTasks.getState().tasks.find(t => t.id !== latest.id && t.data.metadata?.binding && pathIdentity(t.data.metadata.binding.path) === pathIdentity(map.path));
      if (owner) throw new Error(`地图已关联到“${owner.name}”`);
      // Allocate only after the user has reviewed the proposed IDs.
      if (current.allocations.length) {
        let sheets = { ...latest.data.sheets };
        for (const a of current.allocations) { const sheet = sheets[a.category], rows = [...sheet.rows]; rows[a.row] = { ...rows[a.row], cells: { ...rows[a.row].cells, [sheet.columns[0].key]: a.id } }; sheets = { ...sheets, [a.category]: { ...sheet, rows } }; }
        updateObjectTask(latest.id, { sheets, pastBooks: [...latest.data.pastBooks.slice(-79), latest.data.sheets], futureBooks: [] });
      }
      applyTaskSnapshot(latest.id, checked.merged, current.objects); bindTask(latest.id, map); close();
    } catch (e) { setError(String(e)); }
  };
  return <ObjectModal title="地图物编 · 读取与关联" close={() => { if (!busy) close(); }} className="ot-map-dialog">
    <p className="ot-dialog-hint">读取地图中的物编，与当前工作簿核对差异。确认后只更新工作簿，地图文件保持原样。</p>
    <div className="ot-map-actions"><button className="ot-button" disabled={busy} onClick={() => void load(false, true)}>从地图建立任务</button><button className="ot-button" disabled={busy || !task} onClick={() => void load(false, false)}>关联地图</button><button className="ot-button" disabled={busy || !binding} onClick={() => void load(true, false)}>读取地图物编 / 检查差异</button><button className="ot-button" disabled={busy || !binding} onClick={() => { if (task) updateObjectTask(task.id, { metadata: { name: task.name } }); setMap(null); }}>解除关联</button></div>
    {binding && <p className="ot-dialog-hint">{binding.path}</p>}
    {listedMap && <><details><summary>有修改的原生对象（独立列表，不能删除）</summary>{Object.entries(listedMap.objects).filter(([, o]) => !o.custom).map(([key, obj]) => <details key={key}><summary>{key} · {Object.keys(obj.fields).length} 个修改字段</summary>{Object.entries(obj.fields).map(([field, value]) => <p key={field}><code>{field}</code>：{display(value)}</p>)}</details>)}</details><details><summary>地图导入资源 · {listedMap.imports.length} 个</summary>{listedMap.imports.slice(0, 200).map((resource, i) => <p key={i}>{resource}</p>)}{listedMap.imports.length > 200 && <p>只显示前 200 条；完整清单保存在工作簿地图资料中。</p>}</details></>}
    <p className="ot-dialog-hint">重复字段保持来源顺序：导出以后列为准，读回时回填最后生效列；早期列保留。公式发生反向修改时需要明确选择保留公式或替换数值。</p>
    {busy && <p role="status">正在只读解析地图…</p>}{error && <p role="alert">{error}</p>}
    {!!compiled?.issues.length && <div className="ot-map-issues">{compiled.issues.map((issue, i) => <button key={i} onClick={() => { locate(issue.category, issue.row, issue.col); close(); }}>{issue.message} · 定位</button>)}</div>}
    {!!compiled?.warnings.length && <details><summary>原图引用提示 · {compiled.warnings.length} 项</summary>{compiled.warnings.map((warning, i) => <button className="ot-button" key={i} onClick={() => { locate(warning.category, warning.row, warning.col); close(); }}>{warning.message} · 定位</button>)}</details>}
    {map && <><p>{map.path} · {Object.keys(source).length} 个自定义对象 · {Object.values(map.objects).filter(o => !o.custom).length} 个有修改的原生对象（保留，未铺入表格） · {map.imports.length} 个导入资源</p>
      {map.warnings.map((w, i) => <p key={i} role="alert">{w}</p>)}
      {!!compiled?.allocations.length && <p>拟分配 ID：{compiled.allocations.map(a => `${a.category} 第${a.row + 3}行 → ${a.id}`).join('；')}</p>}
      <div className="ot-map-diff">{differences.map(d => <details key={d.key}><summary>{d.key} · 表格 {d.before ? Object.keys(d.before.fields).length : 0} / 地图 {d.after ? Object.keys(d.after.fields).length : 0} 个属性</summary><table><thead><tr><th>字段</th><th>表格</th><th>地图</th></tr></thead><tbody><tr><td>模板</td><td>{d.before?.parent ?? '无'}</td><td>{d.after?.parent ?? '无'}</td></tr>{[...new Set([...Object.keys(d.before?.fields ?? {}), ...Object.keys(d.after?.fields ?? {})])].filter(key => !equal(d.before?.fields[key], d.after?.fields[key])).map(key => <tr key={key}><td>{key}</td><td>{display(d.before?.fields[key])}</td><td>{display(d.after?.fields[key])}</td></tr>)}</tbody></table></details>)}</div>
      {!!originalReview.conflicts.length && <><div className="ot-map-actions"><button className="ot-button" onClick={() => decide('table')}>所选保留表格</button><button className="ot-button" onClick={() => decide('editor')}>所选保留地图</button><button className="ot-button" onClick={() => decide('table', true)}>全部保留表格</button><button className="ot-button" onClick={() => decide('editor', true)}>全部保留地图</button></div><div className="ot-map-diff">{originalReview.conflicts.map(c => { const key = `${c.key}/${c.field}`; return <div className="ot-map-conflict" key={key}><input aria-label={`选择冲突 ${key}`} type="checkbox" checked={selected.has(key)} onChange={e => setSelected(prev => { const next = new Set(prev); if (e.target.checked) next.add(key); else next.delete(key); return next; })} /><span>{key}{c.formula ? ' · 公式：保留公式或替换数值' : ''}<small>上次：{display(c.baseline)} · {choices[key] ? `已选${choices[key] === 'table' ? '表格' : '地图'}` : '待选择'}</small></span><button className="ot-button" aria-pressed={choices[key] === 'table'} onClick={() => setChoices(p => ({ ...p, [key]: 'table' }))}>表格：{display(c.table)}</button><button className="ot-button" aria-pressed={choices[key] === 'editor'} onClick={() => setChoices(p => ({ ...p, [key]: 'editor' }))}>地图：{display(c.editor)}</button></div>; })}</div></>}
    </>}
    <footer><small>{map ? `${differences.length} 个对象差异 · ${review.conflicts.length} 项待处理冲突` : '等待选择地图'}</small><button className="ot-button" disabled={busy} onClick={close}>取消</button><button className="ot-button ot-primary" disabled={busy || !map || !!compiled?.issues.length || !!review.conflicts.length} onClick={() => void confirm()}>确认软件侧关联</button></footer>
  </ObjectModal>;
}
