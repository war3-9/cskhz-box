import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Box, Star } from 'lucide-react';
import { basename, resourceKey, type Entry, type Source } from '../types';
import { thumbnail } from '../renderer/thumbnails';
import { attachCardPreview } from '../renderer/cardPreviews';
import { useViewer } from '../workspace/store';
import { ModelTooltip } from './ModelTooltip';
import { isUnusedModel } from '../workspace/resourceFilters';
import { selectResource } from '../workspace/selection';
export const ModelCard = memo(function ModelCard({ entry, source, active, suppressTooltip = false }: { entry: Entry; source: Source; active: boolean; suppressTooltip?: boolean }) {
  const key = resourceKey(source, entry.path);
  const state = useViewer(useShallow(s => ({ checked: s.selected.includes(key), favorite: s.favorites.includes(key), focused: s.current?.sourceId === source.id && s.current.path === entry.path, category: s.categories[key], name: s.exportNames[key], revision: s.revision, focus: s.focus, toggle: s.toggle, toggleFavorite: s.favorite })));
  const ref = useRef<HTMLElement>(null), canvas = useRef<HTMLDivElement>(null), [visible, setVisible] = useState(false), [image, setImage] = useState(''), [ready, setReady] = useState(false), [error, setError] = useState('');
  const activeRef = useRef(active); activeRef.current = active;
  const [resident, setResident] = useState(false);
  const [informational, setInformational] = useState(false);
  const checked = state.checked, favorite = state.favorite;
  const [hover, setHover] = useState<{ x: number; y: number }>(), hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  useLayoutEffect(() => { if (suppressTooltip) { clearTimeout(hoverTimer.current); setHover(undefined); } }, [suppressTooltip]);
  useEffect(() => { if (!active || !visible) { clearTimeout(hoverTimer.current); setHover(undefined); } }, [active, visible]);
  useEffect(() => {
    if (!active) return;
    const observer = new IntersectionObserver(items => {
      // Sorting can queue both exit and entry for this card in one delivery.
      // Use the latest observation so an earlier exit cannot leave it unloaded.
      const latest = items.at(-1);
      if (activeRef.current && latest) { setVisible(latest.isIntersecting); setResident(latest.isIntersecting); }
    });
    if (ref.current) observer.observe(ref.current); return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    if (!resident) return;
    let alive = true; setError(''); setReady(false); setInformational(false);
    const resource = { sourceId: source.id, path: entry.path };
    if (entry.model && canvas.current) return attachCardPreview(canvas.current, resource, () => setReady(true), (error, note) => { setReady(false); setError(error); setInformational(!!note); });
    thumbnail(resource).then(value => alive && setImage(value)).catch(value => alive && setError(String(value)));
    return () => { alive = false; };
  }, [source.id, entry.path, entry.model, state.revision, resident]);
  const category = entry.terrain ? `${entry.terrain.terrainType} · ${entry.terrain.used ? '地图使用' : '地图内未使用'} · ${entry.terrain.missing ? '资源缺失' : entry.readRef ? '游戏原生' : '地图资源'}` : state.category || '未分类';
  const name = state.name || entry.terrain?.name || basename(entry.path);
  return <article ref={ref} className={`viewer-card ${state.focused ? 'focused' : ''}`} data-path={entry.path} onPointerEnter={event => { if (!entry.model || suppressTooltip) return; clearTimeout(hoverTimer.current); const position = { x: event.clientX, y: event.clientY }; hoverTimer.current = setTimeout(() => setHover(position), 450); }} onPointerLeave={() => { clearTimeout(hoverTimer.current); setHover(undefined); }}>
    <button className="viewer-card-image" style={{ backgroundColor: 'var(--viewer-background)' }} onClick={event => selectResource({ sourceId: source.id, path: entry.path }, event)} onDoubleClick={() => state.focus({ sourceId: source.id, path: entry.path }, true)} title="单击选择 · Ctrl 多选 · Shift 连选 · 双击预览" aria-label={`预览 ${name}`} aria-pressed={checked}>
      {entry.model ? <div ref={canvas} className="viewer-card-canvas" role="img" aria-label={`${name} 动态预览`} data-ready={ready} /> : image ? <img src={image} alt={name} /> : null}
      {(entry.model ? !ready : !image) && <span className={`viewer-preview-message${informational ? ' is-note' : ''}`} title={error || undefined}>{error || (active && visible ? '加载中' : entry.model ? 'MDX / MDL' : '贴图')}</span>}
      <span className="viewer-card-category">{category}</span><Box className="viewer-card-model" size={13} />
      {entry.model && isUnusedModel(source, entry.path) && <span className="viewer-unused-badge" title={source.analysis?.usageNote}>未使用模型</span>}
    </button>
    <div className="viewer-card-footer"><input type="checkbox" aria-label={`勾选 ${name}`} checked={checked} onChange={() => state.toggle(key)} /><button aria-label={name === basename(entry.path) ? entry.path : `${name} · 原路径：${entry.path}`} onClick={event => selectResource({ sourceId: source.id, path: entry.path }, event)} onDoubleClick={() => state.focus({ sourceId: source.id, path: entry.path }, true)}>{name}</button><button className={favorite ? 'favorite' : ''} aria-label={favorite ? '取消收藏' : '收藏'} onClick={() => state.toggleFavorite(key)}><Star size={13} fill={favorite ? 'currentColor' : 'none'} /></button></div>
    {hover && active && !suppressTooltip && <ModelTooltip source={source} entry={entry} x={hover.x} y={hover.y} />}
  </article>;
});
