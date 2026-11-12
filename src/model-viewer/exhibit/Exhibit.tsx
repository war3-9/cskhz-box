import { StyledSelect } from '../../shared/components/StyledSelect';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Focus, Pause, Play, RotateCcw } from 'lucide-react';
import type { Vector3 } from 'three';
import { useViewer, visibleModels } from '../workspace/store';
import { loadModel } from '../resources/models';
import { ExhibitScene, type ItemOptions } from './scene';
import { exhibitEntries } from './scope';
import { Minimap } from './Minimap';
import { SelectionPanel } from './SelectionPanel';
import { GroundControls } from './GroundControls';
import './exhibit.css';
import { resourceKey } from '../types';
type Pose = ExhibitScene['pose'];
const sessions = new Map<string, { pose: Pose; options: Record<number, ItemOptions> }>();
interface Drag { x: number; y: number; startX: number; startY: number; pan: boolean; index: number; moved: boolean; ground?: { x: number; y: number }; options?: ItemOptions; target?: Vector3; pointerId: number; box?: boolean; before: number[]; keys: string[]; additive: boolean; group: { index: number; options: ItemOptions }[] }
export function Exhibit({ active }: { active: boolean }) {
  const state = useViewer(), canvas = useRef<HTMLCanvasElement>(null), scene = useRef<ExhibitScene | undefined>(undefined), drag = useRef<Drag | undefined>(undefined);
  const activeRef = useRef(active); activeRef.current = active;
  const animation = useRef<{ start: () => void; stop: () => void } | undefined>(undefined);
  const groundImage = useRef<{ image?: ImageData } | undefined>(undefined);
  const applyGround = useCallback((image?: ImageData) => { groundImage.current = { image }; scene.current?.floor(image); }, []);
  const [count, setCount] = useState(0), [processed, setProcessed] = useState(0), [failed, setFailed] = useState(0), [error, setError] = useState(''), [selected, setSelected] = useState(-1), [, refresh] = useState(0);
  const [map, setMap] = useState<ReturnType<ExhibitScene['minimap']>>();
  const [selection, setSelection] = useState<number[]>([]), [box, setBox] = useState<{ left: number; top: number; width: number; height: number }>();
  const source = state.sources.find(s => s.id === state.activeSource), displayed = exhibitEntries(visibleModels(state), state.page, state.settings.pageSize, state.exhibitLimit);
  const identity = displayed.map(e => e.path).join('|');
  const normalized = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * 2 - 1, y: 1 - (event.clientY - rect.top) / rect.height * 2 }; };
  const choose = (indices: number[], sync = true) => {
    setSelection(indices); setSelected(indices.at(-1) ?? -1); scene.current?.selection(indices);
    if (sync && source) {
      const keys = new Set(displayed.map(entry => resourceKey(source, entry.path))), current = useViewer.getState();
      current.patch({ selected: [...current.selected.filter(key => !keys.has(key)), ...indices.map(index => resourceKey(source, displayed[index].path))] });
    }
    refresh(n => n + 1);
  };
  const change = (value: Partial<ItemOptions>) => { scene.current?.changeMany(selection.map(index => ({ index, value })), useViewer.getState().settings); refresh(n => n + 1); };
  const cancelDrag = () => {
    const d = drag.current; if (!d) return;
    scene.current?.changeMany(d.group.map(item => ({ index: item.index, value: item.options })), useViewer.getState().settings);
    choose(d.before, false); useViewer.getState().patch({ selected: d.keys }); drag.current = undefined; setBox(undefined);
    if (canvas.current) { delete canvas.current.dataset.dragging; if (canvas.current.hasPointerCapture(d.pointerId)) canvas.current.releasePointerCapture(d.pointerId); }
  };
  useEffect(() => {
    if (!source || !canvas.current) return;
    let alive = true, raf = 0, last = performance.now(), mapTime = 0, next = 0;
    setError(''); setCount(0); setProcessed(0); setFailed(0); setSelected(-1); setSelection([]); setBox(undefined); setMap(undefined);
    let instance: ExhibitScene;
    try { instance = new ExhibitScene(canvas.current, displayed.length); scene.current = instance; } catch (failure) { setError(String(failure)); return; }
    const initial = displayed.flatMap((entry, index) => useViewer.getState().selected.includes(resourceKey(source, entry.path)) ? [index] : []);
    setSelection(initial); setSelected(initial.at(-1) ?? -1); instance.selection(initial);
    const sessionKey = source.id + ':' + identity, saved = sessions.get(sessionKey);
    instance.layout(useViewer.getState().settings); if (saved) instance.restore(saved.pose); else instance.initialView(useViewer.getState().settings);
    if (groundImage.current) instance.floor(groundImage.current.image);
    const tick = (now: number) => {
      raf = 0; if (!activeRef.current || !alive) return;
      if (now - last >= 32) {
        const s = useViewer.getState();
        try { instance.draw(s.settings, Math.min(50, now - last), s.playing); if (instance.renderError) { setError(instance.renderError); instance.renderError = undefined; } if (now - mapTime > 150) { setMap(instance.minimap(s.settings)); mapTime = now; } }
        catch (failure) { setError(String(failure)); } last = now;
      } if (alive) raf = requestAnimationFrame(tick);
    };
    animation.current = { start: () => { if (!raf && alive) { last = performance.now(); raf = requestAnimationFrame(tick); } }, stop: () => { cancelAnimationFrame(raf); raf = 0; } };
    if (activeRef.current) animation.current.start();
    const worker = async () => {
      while (alive && next < displayed.length) {
        if (!activeRef.current) { await new Promise(resolve => setTimeout(resolve, 200)); continue; }
        const index = next++, entry = displayed[index];
        try {
          const loaded = await loadModel({ sourceId: source.id, path: entry.path }, false); if (!alive) break;
          instance.add(loaded, useViewer.getState().settings.action, index);
          instance.change(index, saved?.options[index] || {}, useViewer.getState().settings); setCount(n => n + 1); setProcessed(n => n + 1);
        } catch (failure) { if (alive) { setFailed(n => n + 1); setProcessed(n => n + 1); setError(entry.path + '：' + String(failure)); } }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }; void Promise.all(Array.from({ length: 4 }, worker));
    return () => {
      alive = false; const options: Record<number, ItemOptions> = {}; displayed.forEach((_, index) => { const item = instance.item(index); if (item) options[index] = item.options; });
      sessions.set(sessionKey, { pose: instance.pose, options }); if (sessions.size > 8) sessions.delete(sessions.keys().next().value!);
      cancelAnimationFrame(raf); instance.destroy(); scene.current = undefined; animation.current = undefined; drag.current = undefined;
    };
  }, [source?.id, identity, state.revision]);
  useEffect(() => { if (active) animation.current?.start(); else { animation.current?.stop(); drag.current = undefined; setBox(undefined); } }, [active]);
  useEffect(() => {
    if (!active || !source) return;
    const indices = displayed.flatMap((entry, index) => state.selected.includes(resourceKey(source, entry.path)) ? [index] : []);
    setSelection(indices); setSelected(indices.at(-1) ?? -1); scene.current?.selection(indices);
  }, [active, source?.id, identity, state.selected]);
  useEffect(() => { scene.current?.layout(state.settings); }, [state.settings.rows, state.settings.spacing, state.settings.height]);
  useEffect(() => { scene.current?.action(state.settings.action); refresh(n => n + 1); }, [state.settings.action]);
  const item = scene.current?.item(selected);
  return <section className="viewer-exhibit"><header className="viewer-exhibit-toolbar"><button onClick={() => state.patch({ mode: 'grid' })}><ArrowLeft size={17} />返回浏览</button><button title="适配全部模型" onClick={() => scene.current?.fit(state.settings)}><Focus size={17} /></button><button title="适配选中模型" disabled={!item} onClick={() => scene.current?.fit(state.settings, selected)}><Focus size={17} /></button><button title={state.playing ? '暂停' : '播放'} onClick={() => state.patch({ playing: !state.playing })}>{state.playing ? <Pause size={17} /> : <Play size={17} />}</button>
    <button title="恢复正面视角" onClick={() => scene.current?.initialView(state.settings)}><RotateCcw size={17} />正面视角</button>
    <label>每行<input aria-label="模型地图每行数量" type="number" min="1" max="20" value={state.settings.rows} onChange={e => state.configure({ rows: Math.max(1, Math.min(20, Number(e.target.value))) })} /></label><label>间距<input aria-label="模型地图间距" type="number" min="50" max="2000" value={state.settings.spacing} onChange={e => state.configure({ spacing: Math.max(50, Math.min(2000, Number(e.target.value))) })} /></label><label>高度<input aria-label="整体模型高度" type="number" min="-2000" max="2000" value={state.settings.height} onChange={e => state.configure({ height: Math.max(-2000, Math.min(2000, Number(e.target.value))) })} /></label>
    <GroundControls apply={applyGround} /><StyledSelect aria-label="展台动画" value={state.settings.action} onChange={e => state.configure({ action: e.target.value })}>{['stand', 'walk', 'attack', 'spell', 'death'].map(a => <option key={a}>{a}</option>)}</StyledSelect><input aria-label="地面背景" type="color" value={state.settings.background} onChange={e => state.configure({ background: e.target.value })} /><span data-testid="exhibit-progress">{failed ? `${processed} / ${displayed.length} · 成功 ${count} · 失败 ${failed}` : `${count} / ${displayed.length}`}</span><span className="viewer-exhibit-hint">空白处左键框选 · Shift 追加选择 · 拖动选中模型 · Ctrl+左键旋转 · 右键平移 · 滚轮缩放</span></header>
    <div className="viewer-exhibit-stage"><canvas ref={canvas} tabIndex={0} aria-label="模型地图" onContextMenu={e => e.preventDefault()}
      onKeyDown={e => { if (e.key === 'Escape' && drag.current) { e.preventDefault(); e.stopPropagation(); cancelDrag(); } }}
      onPointerDown={e => {
        if (e.button !== 0 && e.button !== 2 || !scene.current) return;
        const s = scene.current, p = normalized(e), pan = e.button === 2, rotate = e.ctrlKey && e.button === 0, index = pan || rotate ? -1 : s.pick(p.x, p.y);
        const before = selection, next = pan || rotate ? before : index < 0 ? e.shiftKey ? before : [] : before.includes(index) ? before : e.shiftKey ? [...before, index] : [index];
        const keys = [...useViewer.getState().selected];
        if (!pan && !rotate) choose(next); const item = s.item(index), ground = item && s.ground(p.x, p.y, item.position.z);
        e.preventDefault(); e.currentTarget.focus({ preventScroll: true });
        drag.current = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, pan, index, moved: false, ground: ground || undefined, options: item?.options, target: pan ? s.target.clone() : undefined, pointerId: e.pointerId, box: !pan && !rotate && index < 0, before, keys, additive: e.shiftKey, group: next.flatMap(index => { const item = s.item(index); return item ? [{ index, options: item.options }] : []; }) };
        e.currentTarget.dataset.dragging = index >= 0 ? 'model' : 'camera'; e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e => {
        const d = drag.current, s = scene.current; if (!d || !s) return;
        if (e.pointerId !== d.pointerId || !(e.buttons & (d.pan ? 2 : 1))) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) d.moved = true;
        if (!d.moved) return;
        if (d.box) {
          const rect = e.currentTarget.getBoundingClientRect(), p = normalized(e);
          const start = { x: (d.startX - rect.left) / rect.width * 2 - 1, y: 1 - (d.startY - rect.top) / rect.height * 2 };
          const hits = s.marquee(start.x, start.y, p.x, p.y);
          choose(d.additive ? [...new Set([...d.before, ...hits])] : hits);
          setBox({ left: Math.min(d.startX, e.clientX) - rect.left, top: Math.min(d.startY, e.clientY) - rect.top, width: Math.abs(e.clientX - d.startX), height: Math.abs(e.clientY - d.startY) });
        } else if (d.index >= 0 && d.ground && d.options) {
          const p = normalized(e), item = s.item(d.index), point = item && s.ground(p.x, p.y, item.position.z);
          if (point) { s.changeMany(d.group.map(item => ({ index: item.index, value: { x: item.options.x + point.x - d.ground!.x, y: item.options.y + point.y - d.ground!.y } })), useViewer.getState().settings); refresh(n => n + 1); }
        } else if (d.pan) s.pan(e.clientX - d.startX, e.clientY - d.startY, d.target);
        else { s.yaw -= dx * .006; s.pitch = Math.max(.05, Math.min(1.5, s.pitch + dy * .006)); }
        d.x = e.clientX; d.y = e.clientY;
      }}
      onPointerUp={e => { drag.current = undefined; setBox(undefined); delete e.currentTarget.dataset.dragging; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onLostPointerCapture={e => { drag.current = undefined; setBox(undefined); delete e.currentTarget.dataset.dragging; }}
      onPointerCancel={cancelDrag}
      onWheel={e => { if (scene.current) scene.current.distance = Math.max(30, Math.min(50000, scene.current.distance * Math.exp(e.deltaY * .001))); }} />
      <Minimap map={map} selected={selected} navigate={(x, y) => { if (scene.current) { scene.current.target.x = x; scene.current.target.y = y; } }} />
      {box && <div className="viewer-exhibit-marquee" aria-label="展台模型框选范围" style={box} />}
      {item && <SelectionPanel item={item} count={selection.length} change={change} close={() => choose([])} />}{error && <div className="viewer-exhibit-error" role="alert">{error}</div>}
    </div></section>;
}
