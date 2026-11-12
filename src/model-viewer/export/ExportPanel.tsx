import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyledSelect } from '../../shared/components/StyledSelect';
import { isTauri } from '@tauri-apps/api/core';
import { Download, FileInput, FolderOpen, Pencil, Trash2 } from 'lucide-react';
import { useViewer } from '../workspace/store';
import { chooseViewerPath } from '../resources/dialogs';
import { mutationReason } from '../resources/mutations';
import { FileActionDialog } from '../resources/FileActionDialog';
import { startViewerExport, useViewerJobs } from './jobs';
import { exportRefs, type ExportScope } from './scope';
import { BatchRenameDialog } from './BatchRenameDialog';
import { CheckMapPathsDialog } from './CheckMapPathsDialog';
import { resourceKey } from '../types';
import type { ViewerAction } from '../browser/shortcuts';

export function ExportPanel() {
  const state = useViewer(), exporting = useViewerJobs(s => s.busy);
  const [action, setAction] = useState<'delete' | 'import' | 'rename' | 'check'>();
  const closeAction = useCallback(() => setAction(undefined), []);
  const [textureFormat, setTextureFormat] = useState<'raw' | 'png'>('raw');
  const source = state.sources.find(s => s.id === state.activeSource);
  const renamedPaths = source?.entries.filter(entry => entry.model).map(entry => state.exportNames[resourceKey(source, entry.path)]).filter((path): path is string => !!path) ?? [];
  const selected = useMemo(() => exportRefs(state, 'selected'), [state.sources, state.activeSource, state.selected, state.sort, state.kind]);
  const all = useMemo(() => exportRefs(state, 'all'), [state.sources, state.activeSource, state.kind, state.sort]);
  const busy = exporting || !!state.busy || state.fileBusy;
  const reason = mutationReason(source);
  const deleteReason = mutationReason(source, 'delete');
  const directory = async () => {
    try {
      const path = await chooseViewerPath({ title: '选择资源导出目录', directory: true, defaultPath: state.exportDirectory || undefined });
      if (typeof path === 'string') state.patch({ exportDirectory: path, status: '输出目录已设置' });
    } catch (error) { state.patch({ error: String(error) }); }
  };
  const run = async (scope: ExportScope) => {
    if (isTauri() && !useViewer.getState().exportDirectory) await directory();
    const current = useViewer.getState();
    if (isTauri() && !current.exportDirectory) return;
    void startViewerExport({ refs: exportRefs(current, scope), directory: current.exportDirectory, dependencies: current.kind === 'model',
      options: { format: current.kind === 'model' || current.kind === 'music' ? 'raw' : textureFormat, size: 512, transparent: true, fps: 15, seconds: 5, settings: { ...current.settings }, camera: { ...current.camera } } });
  };
  useEffect(() => {
    const action = (event: Event) => {
      const name = (event as CustomEvent<ViewerAction>).detail;
      if (busy || !source || name === 'help') return;
      if (name === 'export') { if (selected.length) void run('selected'); return; }
      if (name === 'delete' && selected.length) { if (deleteReason) state.patch({ error: deleteReason }); else setAction('delete'); }
      if (name === 'rename' && selected.some(ref => /\.(mdx|mdl)$/i.test(ref.path))) setAction('rename');
      if (name === 'import' && !reason) setAction('import');
    };
    window.addEventListener('viewer-action', action); return () => window.removeEventListener('viewer-action', action);
  }, [busy, source, selected, deleteReason, reason, state.exportDirectory]);
  return <section className="viewer-export-panel" aria-label="导出设置">
    <h3>导出设置</h3>
    {(state.kind === 'texture' || state.kind === 'terrain') && <label>贴图导出格式<StyledSelect aria-label="贴图批量导出格式" value={textureFormat} disabled={busy} onChange={e => setTextureFormat(e.target.value as 'raw' | 'png')}><option value="raw">原格式</option><option value="png">PNG</option></StyledSelect></label>}
    <div className="viewer-export-directory"><Download size={17} /><span title={state.exportDirectory}>导出 {state.exportDirectory || (isTauri() ? '未设置' : '浏览器下载')}</span><button disabled={busy} onClick={() => void directory()}><FolderOpen size={15} />选择目录</button></div>
    <div className="viewer-export-actions">
      <button disabled={busy || !selected.length} onClick={() => void run('selected')}><Download size={17} />导出选中</button>
      <button disabled={busy || !all.length} onClick={() => void run('all')} title={`当前来源全部 ${all.length} 个${state.kind === 'model' ? '模型' : state.kind === 'music' ? '音乐' : '贴图'}`}><Download size={17} />导出全部</button>
      {state.kind !== 'music' && <><button className="viewer-delete-action" disabled={busy || !!deleteReason || !selected.length} title={deleteReason || '删除勾选文件'} onClick={() => setAction('delete')}><Trash2 size={17} />删除选中</button>
      <button disabled={busy || !!reason} title={reason || '导入模型和贴图到当前来源'} onClick={() => setAction('import')}><FileInput size={17} />导入文件</button>
      <button className="viewer-rename-action" disabled={busy || !selected.some(ref => /\.(mdx|mdl)$/i.test(ref.path))} title="批量重命名选中模型的导出文件" onClick={() => setAction('rename')}><Pencil size={17} />批量重命名</button>
      <button className="viewer-rename-action" disabled={busy || !renamedPaths.length || !isTauri()} title="导入并保存地图后，只读核对当前来源已重命名模型的完整路径与贴图引用（桌面版）" onClick={() => setAction('check')}><FolderOpen size={17} />检查地图路径</button></>}
    </div>
    {action && source && (action === 'rename' ? <BatchRenameDialog source={source} close={closeAction} /> : action === 'check' ? <CheckMapPathsDialog paths={renamedPaths} close={closeAction} /> : <FileActionDialog action={action} source={source} close={closeAction} />)}
  </section>;
}
