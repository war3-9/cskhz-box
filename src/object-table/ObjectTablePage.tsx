import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CircleHelp, File as FileIcon, FolderOpen, Save, FileUp, Download, Palette, Plus, Redo2, Search, Trash2, Undo2 } from 'lucide-react';
import { CategoryNavigation } from './CategoryNavigation';
import { AlignmentButtons } from './AlignmentButtons';
import { FieldPicker } from './FieldPicker';
import { ObjectGrid, type CellSelection } from './ObjectGrid';
import { categoryById, type CategoryId } from './schema';
import { isObjectDirty, useObjectTable } from './store';
import { useUi } from '../app/uiStore';
import { initializeObjects } from './persistence';
import { exportObjects, guardObjects, openObjects, pickObjectFile, saveObjects } from './files';
import { TaskBar } from './tasks/TaskBar';
import { openObjectTask, pathIdentity, taskView, useObjectTasks } from './tasks/store';
import { MapDialog } from './sync/MapDialog';
import { parseObjectProject } from './project';
import { ObjectExportError, allCategoryIds } from './export';
import { startExcelImport } from './import/client';
import type { Cell } from './grid/geometry';
import { bounds } from './grid/geometry';
import { FindDialog } from './dialogs/FindDialog';
import { BrowserPalette } from './palette/BrowserPalette';
import { useFeatureActive } from '../app/FeatureActivity';
import { useDismissMenus } from './useDismissMenus';
import { openPalette, preparePalette } from './palette/bridge';
import { commitObjectEditor } from './commit';
import { VariablesDialog } from './variables/VariablesDialog';
import './workspace.css';
import './grid.css';
import './dialogs/dialogs.css';
import './palette/palette.css';

const firstSelection = (): CellSelection => ({ start: { row: 0, col: 0 }, end: { row: 0, col: 0 } });
export function ObjectTablePage() {
  const taskId = useObjectTasks(s => s.activeId);
  const [mapDialog, setMapDialog] = useState(false);
  const [variables, setVariables] = useState<string | null>(null);
  const active = useFeatureActive(), [find, setFind] = useState(false);
  const menuRoot = useDismissMenus(active);
  useEffect(() => { const search = (e: KeyboardEvent) => { if (active && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setFind(true); } }; window.addEventListener('keydown', search); return () => window.removeEventListener('keydown', search); }, [active]);
  const state = useObjectTable(useShallow(s => ({ active: s.active, sheets: s.sheets, path: s.path, pastBooks: s.pastBooks, futureBooks: s.futureBooks, activate: s.activate, restore: s.restore, insertRow: s.insertRow, removeRows: s.removeRows, undo: s.undo, redo: s.redo })));
  const dirty = useObjectTable(isObjectDirty), sheet = state.sheets[state.active];
  const standardCategory = categoryById[state.active as CategoryId], localOnly = !standardCategory;
  const category = useMemo(() => standardCategory
    ? { ...standardCategory, columns: sheet.columns }
    : { id: state.active as CategoryId, title: sheet.name, caption: '自定义本地分类', color: '#8b9bb0', columns: sheet.columns },
  [state.active, sheet.name, sheet.columns, standardCategory]);
  const [selection, setSelection] = useState(firstSelection), [locate, setLocate] = useState<Cell | null>(null), [query, setQuery] = useState('');
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [epoch, setEpoch] = useState(0);
  const [restoreError, setRestoreError] = useState('');
  const [operationError, setOperationError] = useState('');
  useEffect(() => { const task = useObjectTasks.getState().tasks.find(t => t.id === taskId); setSelection(task?.selection ?? firstSelection()); setQuery(task?.query ?? ''); setLocate(null); setFind(false); }, [taskId]);
  const select = (next: CellSelection) => { setSelection(next); if (taskId) taskView(taskId, { selection: next }); };
  const cancel = useRef<(() => void) | null>(null), operationLock = useRef(false), notify = useUi(s => s.notify);
  const recover = () => { setRestoreError(''); void initializeObjects().then(() => setReady(true), error => setRestoreError(String(error))); };
  useEffect(() => { recover(); return () => cancel.current?.(); }, []);
  useEffect(() => {
    if (!active || !ready) return;
    const timer = setTimeout(() => { void preparePalette().catch(() => { /* Opening the palette will retry and show any error. */ }); }, 250);
    return () => clearTimeout(timer);
  }, [active, ready]);
  const activate = (id: string) => { state.activate(id); setSelection(firstSelection()); setQuery(''); setLocate(null); };
  const run = async (operation: () => Promise<unknown>) => {
    document.querySelectorAll('.ot-file-menu[open]').forEach(menu => menu.removeAttribute('open'));
    if (operationLock.current) return; operationLock.current = true; setOperationError(''); setBusy(true);
    try { await operation(); } catch (error) {
      if (error instanceof ObjectExportError) { activate(error.category); setLocate({ row: error.row, col: error.col }); }
      setOperationError(String(error));
      notify(String(error), 'error');
    } finally { operationLock.current = false; cancel.current = null; setBusy(false); setProgress(''); }
  };
  const imported = () => { setEpoch(e => e + 1); setSelection(firstSelection()); setQuery(''); setLocate(null); };
  const importFile = async () => {
    if (!await guardObjects()) return;
    setProgress('请选择 Excel 文件…');
    const file = await pickObjectFile(true); if (!file) return;
    setProgress('正在读取 Excel…');
    const task = startExcelImport(file.blob, (message, fraction) => setProgress(`${message} ${Math.round(fraction * 100)}%`)); cancel.current = task.cancel;
    const project = parseObjectProject(JSON.stringify(await task.promise));
    const source = file.path ? `excel:${pathIdentity(file.path)}` : file.blob instanceof File ? `excel:${file.blob.name}:${file.blob.size}:${file.blob.lastModified}` : undefined;
    const name = file.path?.split(/[\\/]/).pop()?.replace(/\.xls[mx]$/i, '') ?? (file.blob instanceof File ? file.blob.name.replace(/\.xls[mx]$/i, '') : 'Excel 导入');
    openObjectTask(project, null, false, name, source); imported(); notify('Excel 物编已导入');
  };
  const exportFile = async (ids: CategoryId[]) => {
    const files = await exportObjects(ids); if (files) notify(`导出完成：${files.length} 个文件，${files.reduce((n, f) => n + f.count, 0)} 个对象`);
  };
  return <main ref={menuRoot} className="object-table" aria-label="物编表格" aria-busy={busy}>
    <BrowserPalette />{active && find && <FindDialog current={selection.end} locate={setLocate} close={() => setFind(false)} />}
    <TaskBar disabled={busy || !ready} run={run} />
    {active && variables && variables === taskId && <VariablesDialog key={taskId} taskId={taskId} close={() => setVariables(null)} />}
    {!localOnly && mapDialog && <MapDialog close={() => setMapDialog(false)} locate={(id, row, col) => { activate(id); setLocate({ row, col }); }} />}
    <div className="ot-topline">{taskId && <CategoryNavigation onActivate={id => { if (!busy) activate(id); }} />}
      <div className="ot-toolbar" inert={busy || !ready}><div className="ot-tool-group">
        <details className="ot-file-menu"><summary className="ot-button" title={taskId ? state.path ?? '物编工作簿' : '没有打开的任务'}>文件{taskId && dirty ? ' ●' : ''}</summary><div className="ot-menu-popover">
          <button onClick={() => void run(async () => { if (!await guardObjects()) return; openObjectTask(); imported(); })}><FileIcon size={15} />新建</button>
          <button onClick={() => void run(async () => { await openObjects(); imported(); })}><FolderOpen size={15} />打开工作簿</button>
          <button onClick={() => void run(async () => { if (await saveObjects()) notify('物编工作簿已保存'); })}><Save size={15} />保存工作簿</button>
          <button onClick={() => void run(importFile)}><FileUp size={15} />导入 Excel</button>
          {!localOnly && <button onClick={() => setMapDialog(true)}>关联地图 / 检查差异</button>}
        </div></details>
        <button className="ot-icon-button" disabled={!taskId} aria-label="保存物编工作簿" title="保存工作簿" onClick={() => void run(async () => { if (await saveObjects()) notify('物编工作簿已保存'); })}><Save size={16} /></button>
        <button className="ot-icon-button" disabled={!taskId} aria-label="在选中行前插入一行" title="在选中行前插入一行" onClick={() => state.insertRow(selection.end.row)}><Plus size={16} /></button>
        <button className="ot-icon-button" aria-label="撤销表格修改" title="撤销 Ctrl+Z" disabled={!taskId || !state.pastBooks.length} onClick={state.undo}><Undo2 size={16} /></button>
        <button className="ot-icon-button" aria-label="重做表格修改" title="重做 Ctrl+Y" disabled={!taskId || !state.futureBooks.length} onClick={state.redo}><Redo2 size={16} /></button>
        <button className="ot-icon-button" aria-label="删除选中行" title="删除选中行（请选择连续区域，可撤销）" disabled={!taskId || !!selection.ranges?.length || !sheet.rows[bounds(selection).r1]} onClick={() => state.removeRows(bounds(selection).r1, bounds(selection).r2)}><Trash2 size={15} /></button>
        <button className="ot-button" disabled={!taskId} onClick={() => setVariables(taskId)}>全局变量</button>
        {!localOnly && <button className="ot-button" disabled={!taskId} title="编辑选中单元格的文字和颜色" onClick={() => void run(async () => { commitObjectEditor(); await openPalette(state.active as CategoryId, selection.end.row, selection.end.col); })}><Palette size={15} aria-hidden="true" />色板</button>}
        <details className="ot-file-menu"><summary className="ot-button" aria-label="物编填写说明" title="留白沿用默认值，# 表示空值"><CircleHelp size={15} /></summary><div className="ot-menu-popover ot-input-help">留白：沿用模板默认值<br />填 #：明确设置为空值（文字、路径、列表）<br />填 0：数值清零<br />要填写字面 #，输入 '#</div></details>
      </div><AlignmentButtons category={state.active as CategoryId} selection={selection} disabled={!taskId} /><div className="ot-tool-group" inert={!taskId}>
        <label className="ot-search"><Search size={15} /><input aria-label="查找对象" placeholder="查找，回车定位" value={query} onChange={e => { setQuery(e.target.value); if (taskId) taskView(taskId, { query: e.target.value }); }} onKeyDown={e => { if (e.key !== 'Enter' || !query) return; const row = sheet.rows.findIndex(row => Object.values(row.cells).some(v => v.toLowerCase().includes(query.toLowerCase()))); if (row >= 0) { const col = sheet.columns.findIndex(c => sheet.rows[row].cells[c.key]?.toLowerCase().includes(query.toLowerCase())); setLocate({ row, col: Math.max(0, col) }); } else notify('没有找到匹配对象'); }} /></label>
        <FieldPicker key={`${epoch}:${state.active}`} category={category} parent={localOnly ? '' : sheet.rows[selection.end.row]?.cells[sheet.columns[1]?.key] ?? ''} onPick={column => setLocate({ row: selection.end.row, col: sheet.columns.findIndex(c => c.key === column.key) })} />
        {!localOnly && <details className="ot-file-menu"><summary className="ot-button"><Download size={14} />导出</summary><div className="ot-menu-popover"><button onClick={() => void run(() => exportFile([state.active as CategoryId]))}>当前分类</button><button onClick={() => void run(() => exportFile(allCategoryIds))}>全部六类</button></div></details>}
      </div>{localOnly ? <span className="ot-local-only">自定义分类 · 仅本地编辑</span> : <span className="ot-local-only">本地编辑</span>}</div>
    </div>
    {progress && <div className="ot-import-progress" role="status">{progress}<button className="ot-button" onClick={() => cancel.current?.()}>取消导入</button></div>}
    {restoreError && <div className="ot-import-progress" role="alert">恢复失败：{restoreError}<button className="ot-button" onClick={recover}>重试恢复</button></div>}
    {operationError && <div className="ot-import-progress" role="alert">{operationError}<button className="ot-button" onClick={() => setOperationError('')}>关闭提示</button></div>}
    <div className="ot-grid-host" inert={busy || !ready}>{ready && (taskId ? <ObjectGrid key={`${taskId}:${epoch}:${state.active}`} category={category} localOnly={localOnly} selection={selection} onSelect={select} locate={locate} report={(message, kind = 'error') => notify(message, kind)} /> : <div className="ot-empty"><p>没有打开的物编任务</p><button className="ot-button" onClick={() => openObjectTask()}>新建物编任务</button><button className="ot-button" onClick={() => void run(openObjects)}>打开工作簿</button><button className="ot-button" onClick={() => void run(importFile)}>导入 Excel</button></div>)}</div>
  </main>;
}
