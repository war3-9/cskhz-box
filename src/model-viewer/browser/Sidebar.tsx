import { StyledSelect } from '../../shared/components/StyledSelect';
import { Box, Check, ChevronDown, Folder, FolderOpen, Grid3X3, Search, X } from 'lucide-react';
import { useViewer, visibleModels } from '../workspace/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LoadDialog } from '../exhibit/LoadDialog';
import { MapBrowser } from '../maps/MapBrowser';
import '../exhibit/exhibit.css';
import { chooseSource, closeSource, openNative, cancelScan, chooseGame } from '../resources/providers';
import { basename, resourceKey } from '../types';
import { ExportPanel } from '../export/ExportPanel';
import { resourceEntries } from '../workspace/resourceFilters';
export function Sidebar() {
  const state = useViewer(), source = state.sources.find(s => s.id === state.activeSource), entries = visibleModels(state);
  const host = useRef<HTMLElement>(null);
  const [loading, setLoading] = useState(false), [browsing, setBrowsing] = useState(false);
  useEffect(() => { if (host.current) host.current.scrollTop = useViewer.getState().sideScroll; }, []);
  const resources = resourceEntries(source, state.kind, state.settings.hideModelTextures, state.modelUsage);
  const directories = useMemo(() => { const directories = new Map<string, number>();
  for (const entry of resources) { const parts = entry.path.replace(/\\/g, '/').split('/'); parts.pop(); for (let i = 1; i <= parts.length; i++) { const directory = parts.slice(0, i).join('/'); directories.set(directory, (directories.get(directory) || 0) + 1); } }
  return directories; }, [resources]);
  const selectAll = () => state.patch({ selected: [...new Set([...state.selected, ...entries.map(e => resourceKey(source!, e.path))])] });
  return <aside ref={host} className="viewer-sidebar" >
    <div className="viewer-source-actions"><strong title={source?.path}>目录：{source?.name || '未打开来源'}</strong>
      <div className="viewer-action-grid"><button onClick={() => void chooseSource('folder')}><FolderOpen size={15} />打开文件夹</button><button onClick={() => void chooseSource('map')}><Box size={15} />打开地图</button>
        <button onClick={() => setBrowsing(true)}><Box size={15} />地图浏览</button><button disabled={!entries.some(e => e.model)} onClick={() => setLoading(true)}><Grid3X3 size={15} />模型地图</button></div>
      <button className="viewer-close-source" disabled={!source} onClick={() => source && void closeSource(source.id)}><X size={15} />关闭</button>
    </div>
    {state.sources.length > 1 && <StyledSelect aria-label="模型来源" value={state.activeSource} onChange={e => state.patch({ activeSource: e.target.value, modelUsage: 'all', page: 0, directory: '', query: '', category: '', detail: false, current: undefined, scroll: 0 })}>{state.sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</StyledSelect>}
    <div className="viewer-selection-actions"><button disabled={!entries.length} onClick={selectAll}><Check size={18} />全选</button><button onClick={() => state.patch({ selected: [] })}><X size={18} />全不选</button></div>
    <div className="viewer-directory-panel"><label className="viewer-search"><Search size={16} /><input placeholder="搜索文件或路径…" value={state.query} onChange={e => state.patch({ query: e.target.value, page: 0 })} /><button title="清除搜索" onClick={() => state.patch({ query: '', page: 0 })}><X size={16} /></button></label>
      <div className="viewer-directory-tree"><button className={!state.directory ? 'active' : ''} onClick={() => state.patch({ directory: '', page: 0 })}><ChevronDown size={14} />（全部）<b>{resources.length}</b></button>
        {[...directories].sort().map(([path, count]) => <button key={path} className={path && path === state.directory ? 'active' : ''} title={path || '根目录'} onClick={() => state.patch({ directory: path, page: 0 })}><Folder size={14} /><span>{path || '根目录'}</span><b>{count}</b></button>)}</div>
    </div>
    <ExportPanel />
    <div className="viewer-action-grid"><button onClick={() => void chooseSource('folder', true)} title="补充模型引用的贴图，不替换当前地图"><FolderOpen size={15} />补充贴图</button><button onClick={() => void chooseGame()} title="只读挂载经典魔兽 MPQ，补齐本体贴图"><Box size={15} />魔兽资源</button></div>
    {!source && !!state.recent.length && <div className="viewer-recent"><strong>最近来源</strong>{state.recent.filter(p => !p.startsWith('browser:')).map(path => <button key={path} title={path} onClick={() => void openNative(path)}><Folder size={14} />{basename(path)}</button>)}</div>}
    {state.busy && <button className="viewer-scan-cancel" onClick={() => void cancelScan()}>取消扫描</button>}
    {source?.warning && <p className="viewer-warning">{source.warning}</p>}
    {loading && <LoadDialog close={() => setLoading(false)} />}{browsing && <MapBrowser close={() => setBrowsing(false)} />}
  </aside>;
}
