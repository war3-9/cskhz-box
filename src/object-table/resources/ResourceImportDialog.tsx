import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { isTauri } from '@tauri-apps/api/core';
import { useObjectTable } from '../store';
import type { CategoryId } from '../schema';
import type { CellSelection } from '../grid/geometry';
import { ResourceSession } from './session';
import { iconChoices, pathFill, resourcePath, type ResourceChoice } from './paths';
import { ResourceCard } from './ResourceCard';
import { ResourceModelPreview } from './ModelPreview';
import './resources.css';
export function ResourceImportDialog({ kind, category, selection, close, report }: {
  kind: 'icon' | 'model'; category: CategoryId; selection: CellSelection; close: () => void; report: (text: string, tone?: 'success' | 'error') => void;
}) {
  const snapshot = useRef({ book: useObjectTable.getState().bookId, sheet: useObjectTable.getState().sheets[category], selection: structuredClone(selection), map: useObjectTable.getState().metadata?.binding?.path });
  const [session, setSession] = useState<ResourceSession>(), [items, setItems] = useState<ResourceChoice[]>([]);
  const current = useRef<ResourceSession | undefined>(undefined), mounted = useRef(true), dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string[]>([]), [query, setQuery] = useState(''), [folder, setFolder] = useState('');
  const [page, setPage] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const [prefix, setPrefix] = useState('ReplaceableTextures\\CommandButtons\\'), [inspect, setInspect] = useState('');
  const [live, setLive] = useState('');
  useEffect(() => { setLive(''); }, [page, query, folder]);
  const [valid, setValid] = useState<Set<string>>(new Set());
  useEffect(() => {
    mounted.current = true; dialog.current?.showModal();
    return () => { mounted.current = false; current.current?.close(); };
  }, [close]);
  const ready = useCallback((path: string, value: boolean) => {
    setValid(previous => { const next = new Set(previous); if (value) next.add(path); else next.delete(path); return next; });
    if (!value) setSelected(previous => previous.filter(item => item !== path));
  }, []);
  const choose = async (full = false) => {
    if (busy) return;
    if (!isTauri()) { setError('素材路径导入请在桌面版使用'); return; }
    setBusy(true); setError('');
    try {
      const path = full ? session?.source?.path : await open(kind === 'icon' ? { title: '选择图标文件夹', directory: true } : { title: '从魔兽地图获取模型', defaultPath: snapshot.current.map, filters: [{ name: '魔兽地图', extensions: ['w3x', 'w3m'] }] });
      if (!mounted.current || typeof path !== 'string') return;
      current.current?.close(); const next = new ResourceSession(); current.current = next;
      setSession(undefined); setItems([]); setSelected([]); setValid(new Set()); setInspect(''); setLive(''); setFolder(''); setPage(0); setQuery('');
      setNote(full ? '正在补全资源原路径，完成后请重新勾选模型。' : '正在读取素材目录，预览将按需加载。');
      const source = await next.open(path, full); if (!mounted.current || current.current !== next) { next.close(); return; }
      setSession(next); setItems(kind === 'icon' ? iconChoices(source.entries) : source.entries.filter(entry => entry.model && /\.(mdx|mdl)$/i.test(entry.path)).map(entry => ({ path: entry.path, ...(entry.anonymous ? { error: '未能核实地图内原路径，不能填写匿名资源名称' } : {}) })).sort((a, b) => a.path.localeCompare(b.path, 'zh-CN', { numeric: true })));
      const normalize = (value: string) => value.replaceAll('/', '\\').toLowerCase();
      setNote([source.warning, !source.complete ? '此来源无法完整枚举，列表可能不完整。' : '', kind === 'model' && snapshot.current.map && normalize(path) !== normalize(snapshot.current.map) ? '所选地图与当前物编关联地图不同，请核对路径。' : ''].filter(Boolean).join(' '));
    } catch (error) { if (mounted.current) setError(String(error)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const filtered = useMemo(() => items.filter(item => item.path.toLowerCase().includes(query.toLowerCase()) && (!folder || item.path.replaceAll('\\', '/').startsWith(folder))), [items, query, folder]);
  const folders = useMemo(() => [...new Set(items.flatMap(item => { const parts = item.path.replaceAll('\\', '/').split('/'); return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/') + '/'); }))].sort(), [items]);
  const toggle = (path: string) => setSelected(previous => previous.includes(path) ? previous.filter(item => item !== path) : [...previous, path]);
  const selectAll = async () => {
    if (!session || busy) return; const active = session; setBusy(true); setError(''); const accepted: string[] = []; let failed = 0;
    try {
      for (const item of filtered) {
        if (!mounted.current || current.current !== active) return;
        if (item.error) { failed++; continue; }
        try { await active.preview(item.path, kind === 'model'); accepted.push(item.path); } catch { failed++; }
      }
      if (mounted.current && current.current === active) { setValid(previous => new Set([...previous, ...accepted])); setSelected(previous => [...new Set([...previous, ...accepted])]); if (failed) setError(`${failed} 项无法预览，已排除；其余已选择`); }
    } finally { if (mounted.current && current.current === active) setBusy(false); }
  };
  const displayPath = (path: string) => { try { return resourcePath(path, kind === 'icon' ? prefix : ''); } catch { return path; } };
  let fill: ReturnType<typeof pathFill> | undefined, issue = '';
  try { fill = pathFill(snapshot.current.sheet, snapshot.current.selection, selected.map(path => resourcePath(path, kind === 'icon' ? prefix : ''))); }
  catch (error) { issue = (error as Error).message; }
  const commit = () => {
    const state = useObjectTable.getState(), captured = snapshot.current;
    if (state.bookId !== captured.book || state.active !== category || state.sheets[category] !== captured.sheet) { setError('目标表格已变化，请关闭弹窗并重新选择单元格'); return; }
    if (!fill || selected.some(path => !valid.has(path))) { setError(issue || '所选素材尚未通过预览检查'); return; }
    state.write(category, fill.row, fill.col, fill.matrix); report(`已填入 ${selected.length} 个${kind === 'icon' ? '图标' : '模型'}路径，可一次撤销`, 'success'); close();
  };
  const reorder = (index: number, delta: number) => setSelected(previous => { const next = [...previous], to = index + delta; if (to >= 0 && to < next.length) [next[index], next[to]] = [next[to], next[index]]; return next; });
  return <dialog ref={dialog} className={`ot-resource-dialog ${session ? 'is-expanded' : ''}`} aria-label={kind === 'icon' ? '导入图标' : '导入模型'} onKeyDown={event => event.stopPropagation()} onCopy={event => event.stopPropagation()} onCut={event => event.stopPropagation()} onPaste={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2>{kind === 'icon' ? '导入图标' : '导入模型'}</h2><button onClick={close} aria-label="关闭资源导入">关闭</button></header>
    <p>{kind === 'model' ? '请选择当前物编正在编辑的地图，否则路径可能无效。' : '请确保素材已按此路径导入当前地图。'}</p>
    <div className="ot-resource-tools"><button disabled={busy} onClick={() => void choose()}>{busy ? '正在读取…' : kind === 'icon' ? '选择文件夹' : '从魔兽地图获取模型'}</button>
      {kind === 'icon' && <label>路径前缀 <input aria-label="图标路径前缀" value={prefix} onChange={event => setPrefix(event.target.value)} /></label>}
      {session && <><input aria-label="搜索导入素材" placeholder="搜索素材" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
      <select aria-label="素材子目录" value={folder} onChange={event => { setFolder(event.target.value); setPage(0); }}><option value="">全部子目录</option>{folders.map(path => <option key={path}>{path}</option>)}</select>
      <button disabled={busy} onClick={() => void selectAll()}>全选筛选结果</button></>}
      {session && !session.source?.complete && <button disabled={busy} title="执行完整路径扫描，完成后需重新勾选" onClick={() => void choose(true)}>补全路径</button>}
    </div>{note && <p role="status">{note}</p>}{error && <p className="ot-resource-error" role="alert">{error}</p>}
    {session && <div className="ot-resource-body"><div><div className="ot-resource-grid">{filtered.slice(page * 12, page * 12 + 12).map(item => <ResourceCard key={`${session.id}:${item.path}`} item={item} session={session} model={kind === 'model'} selected={selected.indexOf(item.path) + 1} toggle={() => toggle(item.path)} inspect={() => { setInspect(item.path); setLive(''); }} ready={ready} live={live === item.path} activate={() => { if (kind === 'model') setLive(item.path); }} deactivate={() => setLive(previous => previous === item.path ? '' : previous)} />)}</div>
      {!filtered.length && <p>没有找到可用素材</p>}<div className="ot-resource-pages"><button disabled={!page} onClick={() => setPage(value => value - 1)}>上一页</button><span>{page + 1} / {Math.max(1, Math.ceil(filtered.length / 12))} · {filtered.length} 项</span><button disabled={(page + 1) * 12 >= filtered.length} onClick={() => setPage(value => value + 1)}>下一页</button></div></div>
      {kind === 'model' && inspect && <ResourceModelPreview key={`${session.id}:${inspect}`} session={session} path={inspect} />}
      <aside className="ot-resource-selected"><strong>填写顺序（{selected.length}）</strong>{selected.map((path, index) => <div key={path}><span>{index + 1}. {displayPath(path)}</span><button aria-label={`上移 ${path}`} disabled={!index} onClick={() => reorder(index, -1)}>↑</button><button aria-label={`下移 ${path}`} disabled={index === selected.length - 1} onClick={() => reorder(index, 1)}>↓</button><button aria-label={`移除 ${path}`} onClick={() => toggle(path)}>×</button></div>)}</aside>
    </div>}
    <footer><span>{fill ? `写入 ${fill.range}，覆盖 ${fill.overwritten} 个非空单元格` : issue}</span><button onClick={close}>取消</button><button disabled={busy || !fill || selected.some(path => !valid.has(path))} onClick={commit}>确认导入路径</button></footer>
  </dialog>;
}
