import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { Download, FolderOpen, X } from 'lucide-react';
import { basename, resourceKey, type Source } from '../types';
import { useViewer } from '../workspace/store';
import { chooseViewerPath } from '../resources/dialogs';
import { exportPath, singleModelName } from './naming';
import { startViewerExport, useViewerJobs } from './jobs';

export function ModelExportDialog({ source, path, close }: { source: Source; path: string; close: () => void }) {
  const state = useViewer(), busy = useViewerJobs(s => s.busy), desktop = isTauri();
  const [initial] = useState(() => exportPath({ sourceId: source.id, path }, [source], state.exportNames));
  const [name, setName] = useState(basename(initial));
  const [folder, setFolder] = useState(desktop ? initial.replace(/[^/\\]+$/, '') : '');
  const [directory, setDirectory] = useState(state.exportDirectory);
  const [error, setError] = useState(''), [choosing, setChoosing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  let output = '', invalid = '';
  try { output = singleModelName(name, path, folder); } catch (failure) { invalid = (failure as Error).message; }
  if (!desktop && folder) invalid = '带目录的模型请在桌面版导出，浏览器下载无法保留目录结构';
  useEffect(() => {
    input.current?.focus(); input.current?.setSelectionRange(0, basename(initial).replace(/\.(mdx|mdl)$/i, '').length);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [close, initial]);
  const choose = async () => {
    setChoosing(true); setError('');
    try {
      const value = await chooseViewerPath({ title: '选择模型导出目录', directory: true });
      if (typeof value === 'string') setDirectory(value);
    } catch (failure) { setError(String(failure)); }
    finally { setChoosing(false); }
  };
  const run = () => {
    if (invalid || busy || choosing) return;
    if (desktop && !directory) { setError('请选择输出目录'); return; }
    const current = useViewer.getState();
    current.patch({ exportDirectory: directory });
    void startViewerExport({ refs: [{ sourceId: source.id, path }], directory, dependencies: true,
      names: { [resourceKey(source, path)]: output },
      options: { format: 'raw', size: 512, transparent: true, fps: 15, seconds: 5, settings: { ...current.settings }, camera: { ...current.camera } } });
    close();
  };
  return <div className="viewer-dialog-backdrop"><form className="viewer-dialog viewer-file-action" role="dialog" aria-modal="true" aria-label="导出模型及贴图" onSubmit={event => { event.preventDefault(); run(); }}>
    <h3>导出模型及贴图<button type="button" className="viewer-icon" title="关闭" onClick={close}><X size={17} /></button></h3>
    <p>原模型：{basename(path)}。修改导出名称时，配套贴图文件名和模型内部引用会一起更新，原文件不变。</p>
    <label><span>模型文件名</span><input ref={input} aria-label="模型文件名" value={name} onChange={event => setName(event.target.value)} /></label>
    <label><span>地图内路径前缀</span><input aria-label="地图内路径前缀" placeholder="留空表示根目录，例如 Models\\Units" value={folder} onChange={event => setFolder(event.target.value)} /></label>
    {desktop && <label><span>输出目录</span><input aria-label="输出目录" readOnly value={directory} title={directory} /><button type="button" title="选择输出目录" disabled={choosing} onClick={() => void choose()}><FolderOpen size={17} /></button></label>}
    {output && <div className="viewer-file-preview">模型：{output}<br />贴图示例：{output.replace(/\.[^.]+$/, '')}1.blp</div>}
    <p>把模型和配套贴图一起导入地图，导入路径须与上方一致。输出目录选择这些文件的上一级目录。实际贴图扩展名以原素材为准；缺失贴图保留原引用，并在导出结果中提示。</p>
    {(invalid || error) && <p role="alert">{invalid || error}</p>}
    <footer><button type="button" onClick={close}>取消</button><button type="submit" disabled={!!invalid || busy || choosing}><Download size={17} />开始导出</button></footer>
  </form></div>;
}
