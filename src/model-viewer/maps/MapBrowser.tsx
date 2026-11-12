import { StyledSelect } from '../../shared/components/StyledSelect';
import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { FolderOpen, RefreshCw, X } from 'lucide-react';
import { chooseViewerPath } from '../resources/dialogs';
import { openNative } from '../resources/providers';
import { useViewer } from '../workspace/store';
import { MapPreview } from './MapPreview';
import './maps.css';
interface MapEntry { path: string; fileName: string; name: string; directory: string; size: number; error?: string }
export function MapBrowser({ close }: { close: () => void }) {
  const sources = useViewer(s => s.sources), activeSource = useViewer(s => s.activeSource);
  const opening = useViewer(s => !!s.busy || s.fileBusy);
  const current = sources.find(source => source.id === activeSource);
  const [root, setRoot] = useState(current && /\.(w3x|w3m)$/i.test(current.path) ? current.path.replace(/[/\\][^/\\]+$/, '') : '');
  const [maps, setMaps] = useState<MapEntry[]>([]), [selected, setSelected] = useState(''), [folder, setFolder] = useState(''), [query, setQuery] = useState(''), [sort, setSort] = useState('file'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [revision, refresh] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current; if (!root || !isTauri()) return;
    setBusy(true); setError('');
    void invoke<MapEntry[]>('viewer_map_catalog', { directory: root }).then(values => {
      if (token !== generation.current) return; setMaps(values); setSelected(previous => values.some(item => item.path === previous) ? previous : values.find(item => item.path === current?.path)?.path || values[0]?.path || '');
    }, error => { if (token === generation.current) setError(String(error)); }).finally(() => { if (token === generation.current) setBusy(false); });
    return () => { generation.current++; };
  }, [root, revision]);
  const choose = async () => { try { const path = await chooseViewerPath({ title: '选择地图文件夹', directory: true, defaultPath: root || undefined }); if (typeof path === 'string') { setRoot(path); setFolder(''); setMaps([]); setSelected(''); refresh(n => n + 1); } } catch (error) { setError(String(error)); } };
  const item = maps.find(item => item.path === selected), known = sources.find(source => source.path === selected);
  const entries = maps.filter(item => (!folder || item.directory === folder) && `${item.fileName} ${item.name}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'size' ? a.size - b.size : sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN', { numeric: true }) : a.fileName.localeCompare(b.fileName, 'zh-CN', { numeric: true }));
  const open = async (path: string) => { await openNative(path); if (!useViewer.getState().error) close(); };
  return <div className="viewer-dialog-backdrop"><section className="viewer-map-browser" role="dialog" aria-modal="true" aria-label="地图浏览" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
    <header><button autoFocus disabled={!isTauri() || busy || opening} onClick={() => void choose()}><FolderOpen size={16} />选择文件夹</button><button disabled={!root || busy || opening} onClick={() => refresh(n => n + 1)}><RefreshCw size={16} />刷新</button><StyledSelect aria-label="地图排序" value={sort} onChange={e => setSort(e.target.value)}><option value="file">按文件名 (A-Z)</option><option value="name">按地图名称</option><option value="size">按大小升序</option></StyledSelect><input placeholder="输入文件名或地图名查找" value={query} onChange={e => setQuery(e.target.value)} /><button onClick={close}><X size={16} />关闭</button></header>
    {!isTauri() ? <p>地图文件浏览请在桌面版使用。</p> : <div className="viewer-map-columns"><nav><strong>文件夹</strong><button title={root} className={!folder ? 'active' : ''} onClick={() => setFolder('')}>{root.split(/[/\\]/).pop() || '未选择目录'}</button>{[...new Set(maps.map(item => item.directory))].filter(directory => directory !== root).map(directory => <button key={directory} className={folder === directory ? 'active' : ''} title={directory} onClick={() => setFolder(directory)}>{directory.slice(root.length + 1)}</button>)}<small>共找到 {maps.length} 个地图</small></nav>
      <div className="viewer-map-list"><table><thead><tr><th>序号</th><th>文件名称</th><th>地图名称</th><th>大小</th></tr></thead><tbody>{entries.map((entry, index) => <tr key={entry.path} className={selected === entry.path ? 'active' : ''} tabIndex={0} aria-selected={selected === entry.path} onClick={() => setSelected(entry.path)} onDoubleClick={() => !entry.error && void open(entry.path)} onKeyDown={event => { if (event.key === 'Enter') setSelected(entry.path); }}><td>{index + 1}</td><td title={entry.fileName}>{entry.fileName}</td><td title={entry.name}>{entry.name}</td><td>{(entry.size / 1024 / 1024).toFixed(2)} MB</td></tr>)}</tbody></table>{busy && <p role="status">正在读取地图信息…</p>}{!busy && !entries.length && <p>{root ? '没有符合条件的地图' : '请选择地图文件夹'}</p>}</div>
      <aside><h3>地图预览</h3><MapPreview path={item?.path} /><h3>地图信息</h3>{item && <><dl><dt>地图名称</dt><dd>{item.name}</dd><dt>文件名称</dt><dd>{item.fileName}</dd><dt>文件大小</dt><dd>{(item.size / 1024 / 1024).toFixed(2)} MB</dd><dt>所在目录</dt><dd title={item.directory}>{item.directory}</dd><dt>可解析模型</dt><dd>{known ? `${known.entries.filter(e => e.model).length} 个` : '打开地图后统计'}</dd></dl>{item.error && <p role="alert">{item.error}</p>}<button disabled={!!item.error || !!useViewer.getState().busy} onClick={() => void open(item.path)}>打开地图</button></>}</aside>
    </div>}{error && <p role="alert">{error}</p>}
  </section></div>;
}
