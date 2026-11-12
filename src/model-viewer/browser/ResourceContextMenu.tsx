import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { basename, resourceKey, type Entry, type Source } from '../types';
import { useViewer } from '../workspace/store';
import { mutationReason } from '../resources/mutations';
import { FileActionDialog } from '../resources/FileActionDialog';
import { chooseViewerPath } from '../resources/dialogs';
import { startViewerExport, useViewerJobs } from '../export/jobs';
import { isTauri } from '@tauri-apps/api/core';
import { ModelExportDialog } from '../export/ModelExportDialog';
import { CategorySubmenu } from './CategorySubmenu';
import { CategoryDialog } from './CategoryDialog';
import { contextModelKeys } from '../workspace/categories';
import { copyModelFiles } from '../resources/fileClipboard';
import { clipboardModelPaths } from './clipboardTargets';
import './contextMenu.css';

export function ResourceContextMenu({ source, entry, x, y, close }: { source: Source; entry: Entry; x: number; y: number; close: () => void }) {
  const menu = useRef<HTMLDivElement>(null), [deleting, setDeleting] = useState<'model' | 'whole'>(), [exportDialog, setExportDialog] = useState(false);
  const state = useViewer(), exporting = useViewerJobs(s => s.busy);
  const [submenu, setSubmenu] = useState(false), [keyboardSubmenu, setKeyboardSubmenu] = useState(false), [creating, setCreating] = useState(false);
  const categoryButton = useRef<HTMLButtonElement>(null), submenuId = useId();
  const [targets] = useState(() => contextModelKeys(source, useViewer.getState().selected, entry.path));
  const paths = entry.model ? source.entries.filter(item => item.model && targets.includes(resourceKey(source, item.path))).map(item => item.path) : [entry.path];
  const dismissSubmenu = () => { setSubmenu(false); categoryButton.current?.focus(); };
  const busy = !!state.busy || state.fileBusy || exporting;
  const reason = entry.readRef || entry.terrain?.missing ? '原生地形纹理只读' : mutationReason(source, 'delete');
  const resource = { sourceId: source.id, path: entry.path };
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    element.querySelector<HTMLButtonElement>('button')?.focus();
  }, [x, y]);
  useEffect(() => {
    if (deleting || exportDialog || creating) return;
    const pointer = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !(event.target as Element).closest(`[data-viewer-category-submenu="${submenuId}"]`)) close(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (submenu) dismissSubmenu(); else close(); } };
    window.addEventListener('pointerdown', pointer);
    window.addEventListener('keydown', key, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('pointerdown', pointer); window.removeEventListener('keydown', key, true); window.removeEventListener('resize', close); };
  }, [close, deleting, exportDialog, creating, submenu, submenuId]);
  const assign = (category: string) => {
    try { useViewer.getState().assign(targets, category); close(); }
    catch (error) { useViewer.getState().patch({ error: String(error) }); close(); }
  };
  const run = async (action: () => Promise<unknown>) => {
    close();
    try { await action(); } catch (error) { useViewer.getState().patch({ error: String(error) }); }
  };
  const exportFile = async () => {
    let directory = state.exportDirectory;
    if (isTauri() && !directory) {
      const value = await chooseViewerPath({ title: '选择资源导出目录', directory: true });
      if (typeof value !== 'string') return;
      directory = value; state.patch({ exportDirectory: directory });
    }
    const current = useViewer.getState();
    await startViewerExport({ refs: [resource], directory, dependencies: entry.model,
      options: { format: 'raw', size: 512, transparent: true, fps: 15, seconds: 5, settings: { ...current.settings }, camera: { ...current.camera } } });
  };
  const exportModels = async (dependencies: boolean) => {
    let directory = useViewer.getState().exportDirectory;
    if (isTauri() && !directory) {
      const value = await chooseViewerPath({ title: '选择资源导出目录', directory: true }); if (typeof value !== 'string') return;
      directory = value; useViewer.getState().patch({ exportDirectory: directory });
    }
    const current = useViewer.getState();
    await startViewerExport({ refs: paths.map(path => ({ sourceId: source.id, path })), directory, dependencies,
      options: { format: 'raw', size: 512, transparent: true, fps: 15, seconds: 5, settings: { ...current.settings }, camera: { ...current.camera } } });
  };
  if (deleting) return <FileActionDialog action="delete" source={source} targets={paths} wholeModel={entry.model && deleting === 'whole'} close={close} />;
  if (exportDialog) return <ModelExportDialog source={source} path={entry.path} close={close} />;
  if (creating) return <CategoryDialog keys={targets} close={close} />;
  return <><div ref={menu} className="viewer-context-menu" role="menu" aria-label="资源右键菜单" style={{ left: x, top: y }} onContextMenu={event => event.preventDefault()} onPointerMove={e => { const button = (e.target as Element).closest('button'); if (button && button !== categoryButton.current) setSubmenu(false); }} onKeyDown={event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setSubmenu(false);
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
  }}>
    <strong title={entry.path}>当前{entry.model ? '模型' : '贴图'}：{basename(entry.path)}</strong>
    {paths.length > 1 && <strong>已选模型：{paths.length} 个</strong>}
    <button role="menuitem" onClick={() => { state.focus(resource, true); close(); }}>预览{entry.model ? '模型' : '贴图'}</button>
    <button role="menuitem" onClick={() => void run(() => navigator.clipboard.writeText(basename(entry.path)))}>复制文件名</button>
    <button role="menuitem" onClick={() => void run(() => navigator.clipboard.writeText(entry.path))}>复制相对路径</button>
    {entry.model && <button role="menuitem" disabled={busy} onClick={() => void run(() => copyModelFiles(source, clipboardModelPaths(source, state.selected, entry.path)))}>复制模型和贴图文件（Ctrl+C）</button>}
    <button role="menuitem" disabled={busy} onClick={() => { if (entry.model) setExportDialog(true); else void run(exportFile); }}>导出{entry.model ? '模型及贴图' : '贴图'}</button>
    {entry.model && <><button role="menuitem" disabled={busy} onClick={() => void run(() => exportModels(false))}>导出{paths.length > 1 ? '选中' : ''}模型（仅模型）</button>{paths.length > 1 && <button role="menuitem" disabled={busy} onClick={() => void run(() => exportModels(true))}>导出选中模型（以及贴图）</button>}</>}
    {entry.model && <button ref={categoryButton} role="menuitem" aria-haspopup="menu" aria-expanded={submenu} aria-controls={submenu ? submenuId : undefined} onPointerEnter={() => { setKeyboardSubmenu(false); setSubmenu(true); }} onClick={() => { setKeyboardSubmenu(true); setSubmenu(true); }} onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); setKeyboardSubmenu(true); setSubmenu(true); } }}>添加分类 · {targets.length} 个模型　›</button>}
    {entry.model && <button role="menuitem" onClick={() => { state.patch({ kind: 'texture', query: '', directory: '', category: '', page: 0, scroll: 0 }); close(); }}>浏览此来源的贴图</button>}
    <hr />
    {entry.model && <button role="menuitem" className="viewer-context-delete" disabled={busy || !!reason} title={reason || '仅删除选中模型，引用贴图保留并一并备份'} onClick={() => setDeleting('model')}>删除模型（仅模型）</button>}
    <button role="menuitem" className="viewer-context-delete" disabled={busy || !!reason} title={reason || '删除资源，操作前确认'} onClick={() => setDeleting('whole')}>删除{entry.model ? paths.length > 1 ? '模型（以及贴图）' : '模型（整体）' : '贴图'}</button>
    {reason && <small>{reason}</small>}
  </div>{submenu && <CategorySubmenu names={state.categoryNames} anchor={categoryButton} keyboard={keyboardSubmenu} id={submenuId} dismiss={dismissSubmenu} assign={assign} create={() => { setSubmenu(false); setCreating(true); }} />}</>;
}
