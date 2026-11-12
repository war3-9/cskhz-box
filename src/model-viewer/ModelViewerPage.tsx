import { useEffect, useRef, useState } from 'react';
import { useViewer } from './workspace/store';
import { openFiles } from './resources/providers';
import { Browser } from './browser/Browser';
import { ModelDetail } from './inspector/ModelDetail';
import { Exhibit } from './exhibit/Exhibit';
import { ExportProgress } from './export/ExportProgress';
import { FileInputs } from './resources/FileInputs';
import { previewActivity } from './renderer/cardPreviews';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openNative } from './resources/providers';
import { shortcutRows, useViewerShortcuts, type ViewerAction } from './browser/shortcuts';
import './viewer.css';
import './browser/browser.css';
import './browser/preview.css';
import './inspector/inspector.css';
import './export/panel.css';
export function ModelViewerPage({ active = true }: { goHome: () => void; active?: boolean }) {
  const state = useViewer();
  const [shortcuts, setShortcuts] = useState(false);
  useViewerShortcuts(active);
  useEffect(() => {
    const action = (event: Event) => { if (active && (event as CustomEvent<ViewerAction>).detail === 'help') setShortcuts(true); };
    window.addEventListener('viewer-action', action); return () => window.removeEventListener('viewer-action', action);
  }, [active]);
  const browsing = active && !state.detail && state.mode !== 'exhibit';
  const exhibitOpened = useRef(false); if (state.mode === 'exhibit') exhibitOpened.current = true;
  useEffect(() => { previewActivity(browsing); return () => previewActivity(false); }, [browsing]);
  useEffect(() => {
    if (!active || !isTauri()) return;
    let disposed = false, stop: (() => void) | undefined;
    let drops = Promise.resolve();
    void listen<{ path: string }>('viewer-drop-path', event => { drops = drops.then(() => disposed ? undefined : openNative(event.payload.path)); }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten; });
    return () => { disposed = true; stop?.(); };
  }, [active]);
  useEffect(() => { void Promise.resolve(useViewer.persist.rehydrate()).catch(error => useViewer.getState().patch({ error: String(error) })); }, []);
  return <main className="viewer-shell" aria-label="模型查看器工作区" style={{ '--viewer-side-width': `${state.settings.sideWidth}px`, '--viewer-background': state.settings.background } as React.CSSProperties}
    onDragOver={e => { if (active && e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
    onDrop={e => { if (!active) return; e.preventDefault(); if (e.dataTransfer.files.length) void openFiles([...e.dataTransfer.files]); }}>
    <div className="feature-slot" hidden={state.detail || state.mode === 'exhibit'}><Browser active={browsing} /></div>
    {state.detail && <ModelDetail active={active} />}
    {exhibitOpened.current && <div className="feature-slot" hidden={state.detail || state.mode !== 'exhibit'}><Exhibit active={active && !state.detail && state.mode === 'exhibit'} /></div>}
    <FileInputs /><ExportProgress />{shortcuts && active && <div className="viewer-dialog-backdrop"><section className="viewer-dialog viewer-shortcuts" role="dialog" aria-modal="true" aria-label="模型查看快捷键" tabIndex={-1} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setShortcuts(false); } }}><h3>模型查看快捷键<button autoFocus onClick={() => setShortcuts(false)}>关闭</button></h3><dl>{shortcutRows.map(([key, description]) => <div key={key}><dt>{key}</dt><dd>{description}</dd></div>)}</dl></section></div>}<div className="viewer-status" role="status">{state.busy ? '正在扫描… ' : ''}{state.status || '单击选择 · Ctrl 多选 · Shift 连选 · 拖动框选 · 双击预览 · F1 快捷键'}{state.error && <><span className="viewer-status-error">{state.error}</span><button onClick={() => state.patch({ error: '' })}>关闭错误</button></>}</div>
  </main>;
}
