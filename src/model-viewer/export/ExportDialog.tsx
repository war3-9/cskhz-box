import { StyledSelect } from '../../shared/components/StyledSelect';
import { useState } from 'react';
import { chooseViewerPath } from '../resources/dialogs';
import { isTauri } from '@tauri-apps/api/core';
import { Download, FolderOpen, X } from 'lucide-react';
import { useViewer } from '../workspace/store';
import { exportRefs, type ExportScope } from './scope';
import { startViewerExport, useViewerJobs } from './jobs';
export function ExportDialog({ close }: { close: () => void }) {
  const state = useViewer(), busy = useViewerJobs(s => s.busy);
  const [format, setFormat] = useState<'raw' | 'png' | 'gif'>('raw'), [size, setSize] = useState(512), [transparent, setTransparent] = useState(true), [dependencies, setDependencies] = useState(true), [fps, setFps] = useState(15), [seconds, setSeconds] = useState(5), [error, setError] = useState('');
  const [scope, setScope] = useState<ExportScope>(state.detail || !state.selected.length ? 'current' : 'selected');
  const refs = exportRefs(state, scope), directory = state.exportDirectory;
  const texturesOnly = refs.length > 0 && refs.every(ref => state.sources.find(s => s.id === ref.sourceId)?.entries.find(e => e.path === ref.path)?.model === false);
  const run = () => {
    if (!refs.length || busy) return;
    if (isTauri() && !directory) { setError('请选择输出目录'); return; }
    void startViewerExport({ refs, directory, dependencies, options: { format, size, transparent, fps, seconds, settings: { ...state.settings }, camera: { ...state.camera }, ...(scope === 'current' && state.detail ? { sequence: state.sequence, frame: format === 'png' ? state.frame : undefined } : {}) } }); close();
  };
  return <div className="viewer-dialog-backdrop"><section className="viewer-dialog" role="dialog" aria-modal="true" aria-label="模型导出"><h3>模型导出<button className="viewer-icon" title="关闭" onClick={close}><X size={17} /></button></h3>
    <label><span>导出范围</span><StyledSelect value={scope} onChange={e => setScope(e.target.value as ExportScope)}><option value="current">当前资源</option><option value="selected">勾选资源（{exportRefs(state, 'selected').length}）</option><option value="all">当前来源全部资源（{exportRefs(state, 'all').length}）</option></StyledSelect></label>
    <label><span>输出格式</span><StyledSelect aria-label="模型导出格式" value={format} onChange={e => { setFormat(e.target.value as typeof format); if (e.target.value === 'gif') setSize(n => Math.min(512, n)); }}><option value="raw">魔兽模型 / 贴图（特殊格式自动转换）</option><option value="png">PNG 预览图</option><option value="gif" disabled={texturesOnly}>GIF 动画</option></StyledSelect></label>
    {format === 'raw' ? <label><input type="checkbox" checked={dependencies} onChange={e => setDependencies(e.target.checked)} />同时导出模型贴图</label> : <><label><span>分辨率</span><StyledSelect value={size} onChange={e => setSize(Number(e.target.value))}>{[128, 256, 512, 1024, 2048].filter(n => format !== 'gif' || n <= 512).map(n => <option key={n} value={n}>{n} × {n}</option>)}</StyledSelect></label><label><input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} />透明背景</label></>}
    {format === 'gif' && <><label><span>帧率</span><input type="number" min="5" max="30" value={fps} onChange={e => setFps(Math.max(5, Math.min(30, Number(e.target.value))))} /></label><label><span>最长时长（秒）</span><input type="number" min="1" max="15" value={seconds} onChange={e => setSeconds(Math.max(1, Math.min(15, Number(e.target.value))))} /></label></>}
    {isTauri() && <label><span>输出目录</span><input readOnly value={directory} title={directory} /><button title="选择输出目录" onClick={() => void chooseViewerPath({ title: '选择模型导出目录', directory: true }).then(path => { if (typeof path === 'string') state.patch({ exportDirectory: path }); }).catch(e => setError(String(e)))}><FolderOpen size={17} /></button></label>}
    {error && <p role="alert">{error}</p>}<footer><button onClick={close}>取消</button><button disabled={!refs.length || busy} onClick={run}><Download size={17} />开始导出</button></footer></section></div>;
}
