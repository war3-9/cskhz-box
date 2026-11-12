import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, FolderOpen } from 'lucide-react';
import { useViewer, visibleModels } from '../workspace/store';
import { chooseSource } from '../resources/providers';
import { ModelCard } from './ModelCard';
import { Pagination } from './Pagination';
import { Toolbar } from './Toolbar';
import { Sidebar } from './Sidebar';
import { ResourceContextMenu } from './ResourceContextMenu';
import { mountPreviewSurface, previewLayout } from '../renderer/cardPreviews';
import { MusicBrowser } from '../music/MusicBrowser';
import { createPortal } from 'react-dom';
import { useMarquee } from './useMarquee';
import { hoverClipboardModel } from './clipboardTargets';
export function Browser({ active }: { active: boolean }) {
  const state = useViewer(), entries = visibleModels(state), source = state.sources.find(s => s.id === state.activeSource), scroll = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<{ path: string; x: number; y: number }>();
  const surface = useRef<HTMLDivElement>(null), savedScroll = useRef(0);
  const { box, dragging } = useMarquee(scroll, source, active && state.kind !== 'music', JSON.stringify([state.page, state.kind, state.query, state.directory, state.category, state.sort]));
  useEffect(() => { if (surface.current && scroll.current) return mountPreviewSurface(surface.current, scroll.current); }, []);
  useEffect(() => { setContext(undefined); }, [active, state.activeSource, state.kind, state.revision, state.page]);
  useEffect(() => { hoverClipboardModel(); return () => hoverClipboardModel(); }, [active, state.activeSource, state.kind, state.page]);
  const contextEntry = source?.entries.find(entry => entry.path === context?.path);
  const page = Math.min(state.page, Math.max(0, Math.ceil(entries.length / state.settings.pageSize) - 1));
  useEffect(() => { previewLayout(); }, [entries, page, active, state.settings.cardSize]);
  useLayoutEffect(() => { if (active && scroll.current) scroll.current.scrollTop = savedScroll.current; }, [active]);
  useLayoutEffect(() => { savedScroll.current = 0; if (scroll.current) scroll.current.scrollTop = 0; previewLayout(); }, [state.page, state.activeSource, state.kind, state.query, state.directory, state.category]);
  return <div className="viewer-browser"><Sidebar /><section className="viewer-content"><Toolbar />
    <div className="viewer-preview-viewport"><div ref={scroll} className="viewer-resources" onPointerMove={event => {
      const card = (event.target as Element).closest<HTMLElement>('.viewer-card[data-path]');
      hoverClipboardModel(active ? source?.id : undefined, card?.dataset.path);
    }} onPointerLeave={() => hoverClipboardModel()} onScroll={e => { hoverClipboardModel(); savedScroll.current = e.currentTarget.scrollTop; if (context) setContext(undefined); }} onContextMenu={event => {
      const card = (event.target as Element).closest<HTMLElement>('.viewer-card[data-path]');
      if (!card?.dataset.path || !source) return;
      event.preventDefault();
      state.focus({ sourceId: source.id, path: card.dataset.path });
      setContext({ path: card.dataset.path, x: event.clientX, y: event.clientY });
    }}>
      <div className="viewer-scroll-content">{source && entries.length && state.kind === 'music' ? <MusicBrowser key={source.id} source={source} entries={entries.slice(page * state.settings.pageSize, (page + 1) * state.settings.pageSize)} active={active} /> : source && entries.length ? <div className={`viewer-model-grid size-${state.settings.cardSize}`}>{entries.slice(page * state.settings.pageSize, (page + 1) * state.settings.pageSize).map(entry => <ModelCard key={`${source.id}:${entry.path}`} source={source} entry={entry} active={active} suppressTooltip={!!context || !!box || dragging.current} />)}</div> : <div className="viewer-empty-state"><Box size={42} /><strong>{source ? '没有符合条件的资源' : '模型查看器'}</strong>{!source && <button onClick={() => void chooseSource('folder')}><FolderOpen size={17} />打开文件夹</button>}</div>}<div ref={surface} className="viewer-preview-layer" /></div>
    </div></div><Pagination count={entries.length} />{box && createPortal(<div className="viewer-marquee" aria-label="模型框选范围" style={box} />, document.body)}{active && context && source && contextEntry && <ResourceContextMenu key={`${source.id}:${context.path}:${context.x}:${context.y}`} source={source} entry={contextEntry} x={context.x} y={context.y} close={() => setContext(undefined)} />}</section></div>;
}
