import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, RotateCw, RotateCcw, Save, ZoomIn, ZoomOut } from 'lucide-react';
import { Modal } from '../shared/components/Modal';
import { ThemeSelect } from '../shared/components/ThemeSelect';
import { decodeTexture } from '../model-viewer/resources/textures';
import { encodeCanvas } from '../export/encodeCanvas';
import { writeBatchImage } from '../export/batchIO';
import { conversionFormats, type ConversionFormat } from '../image-converter/service';
import { clampCrop, resizeCrop, type CropRect } from './geometry';
import './crop.css';

export function CropDialog({ close }: { close: () => void }) {
  const [source, setSource] = useState<HTMLCanvasElement>(), [name, setName] = useState(''), [directory, setDirectory] = useState('');
  const [rect, setRect] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 }), [ratioName, setRatioName] = useState('free');
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 }), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('');
  const [format, setFormat] = useState<ConversionFormat>('png');
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), input = useRef<HTMLInputElement>(null), generation = useRef(0), busyRef = useRef(false);
  const drag = useRef<{ kind: string; x: number; y: number; rect: CropRect; pan: { x: number; y: number } } | undefined>(undefined);
  const ratio = ratioName === 'original' ? (source ? source.width / source.height : 0) : ratioName === 'free' ? 0 : Number(ratioName);
  const fit = (image: HTMLCanvasElement) => { setZoom(Math.min(1, ((stage.current?.clientWidth ?? 700) - 60) / image.width, 360 / image.height)); setPan({ x: 30, y: 30 }); };
  const load = async (bytes: ArrayBuffer, filename: string, parent = '') => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); const stamp = ++generation.current;
    try {
      const [image] = await decodeTexture(bytes, filename);
      if (image.width * image.height > 40_000_000) throw new Error('图片超过4000万像素');
      const target = document.createElement('canvas'); target.width = image.width; target.height = image.height; target.getContext('2d')!.putImageData(image, 0, 0);
      if (stamp !== generation.current) return;
      setSource(target); setName(filename); setDirectory(parent); setRatioName('free'); setRect({ x: 0, y: 0, width: image.width, height: image.height }); setSaved(''); fit(target);
    } catch (cause) { if (stamp === generation.current) setError(String(cause)); }
    finally { busyRef.current = false; if (stamp === generation.current) setBusy(false); }
  };
  const loadPath = async (path: string) => { if (busyRef.current) return; try { await load(await invoke<ArrayBuffer>('image_conversion_read', { path }), path.split(/[\\/]/).at(-1)!, path.replace(/[\\/][^\\/]+$/, '')); } catch (cause) { setError(String(cause)); } };
  useEffect(() => { if (!isTauri()) return; const pending = listen<{ path: string }>('viewer-drop-path', event => { if (/\.(png|jpe?g|blp|tga)$/i.test(event.payload.path)) void loadPath(event.payload.path); }); return () => { ++generation.current; void pending.then(unlisten => unlisten()); }; }, []);
  useEffect(() => { if (source && canvas.current) { canvas.current.width = source.width; canvas.current.height = source.height; canvas.current.getContext('2d')!.drawImage(source, 0, 0); } }, [source]);
  const choose = async () => { if (!isTauri()) { input.current?.click(); return; } const path = await open({ multiple: false, filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'blp', 'tga'] }] }); if (typeof path === 'string') await loadPath(path); };
  const rotate = () => {
    if (!source) return; const target = document.createElement('canvas'); target.width = source.height; target.height = source.width;
    const context = target.getContext('2d')!; context.translate(target.width, 0); context.rotate(Math.PI / 2); context.drawImage(source, 0, 0);
    setSource(target); setRect({ x: source.height - rect.y - rect.height, y: rect.x, width: rect.height, height: rect.width }); setRatioName('free'); fit(target);
  };
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (!source || busy) return; event.preventDefault(); stage.current!.setPointerCapture(event.pointerId);
    const box = stage.current!.getBoundingClientRect(), point = { x: (event.clientX - box.left - pan.x) / zoom, y: (event.clientY - box.top - pan.y) / zoom };
    const handle = (event.target as HTMLElement).dataset.handle;
    const kind = event.button === 1 || event.altKey ? 'pan' : handle || 'new';
    const initial = kind === 'new' ? clampCrop({ x: point.x, y: point.y, width: 1, height: 1 }, source.width, source.height) : rect;
    if (kind === 'new') setRect(initial);
    drag.current = { kind, x: event.clientX, y: event.clientY, rect: initial, pan };
  };
  const save = async () => {
    if (!source || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const output = isTauri() ? await open({ directory: true, title: '选择裁剪图片保存目录', defaultPath: directory || undefined }) : '下载';
      if (typeof output !== 'string') return;
      const target = document.createElement('canvas'); target.width = rect.width; target.height = rect.height;
      const context = target.getContext('2d')!; context.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      if (format === 'jpg') { context.globalCompositeOperation = 'destination-over'; context.fillStyle = '#fff'; context.fillRect(0, 0, target.width, target.height); }
      const blob = await encodeCanvas(target, format === 'jpg' ? 'jpeg' : format);
      setSaved(await writeBatchImage(output, `${name.replace(/\.[^.]+$/, '')}-裁剪.${format}`, blob));
    } catch (cause) { setError(String(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <Modal title="裁剪图片" close={close} className="image-crop-dialog" dismissDisabled={busy}>
    <div className="crop-toolbar"><button disabled={busy} onClick={() => void choose()}><FolderOpen size={16} />选择图片</button><button disabled={!source || busy} onClick={rotate}><RotateCw size={16} />旋转90°</button><button disabled={!source || busy} onClick={() => { if (source) { setRect({ x: 0, y: 0, width: source.width, height: source.height }); setRatioName('free'); fit(source); } }}><RotateCcw size={16} />重置</button><button aria-label="缩小图片" onClick={() => setZoom(z => Math.max(.02, z / 1.2))}><ZoomOut size={16} /></button><button aria-label="放大图片" onClick={() => setZoom(z => Math.min(16, z * 1.2))}><ZoomIn size={16} /></button><span>{Math.round(zoom * 100)}%</span></div>
    <input ref={input} hidden type="file" accept=".png,.jpg,.jpeg,.blp,.tga" onChange={e => { const file = e.target.files?.[0]; if (file) void file.arrayBuffer().then(bytes => load(bytes, file.name)); e.target.value = ''; }} />
    <div ref={stage} className="crop-stage" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void file.arrayBuffer().then(bytes => load(bytes, file.name)); }} onPointerDown={begin} onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }} onWheel={e => {
      const box = e.currentTarget.getBoundingClientRect(), next = Math.max(.02, Math.min(16, zoom * Math.exp(-e.deltaY * .001)));
      const x = e.clientX - box.left, y = e.clientY - box.top; setPan({ x: x - (x - pan.x) * next / zoom, y: y - (y - pan.y) * next / zoom }); setZoom(next);
    }} onPointerMove={e => {
      const start = drag.current; if (!start || !source) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (start.kind === 'pan') { setPan({ x: start.pan.x + dx, y: start.pan.y + dy }); return; }
      if (start.kind === 'new') setRect(clampCrop({ x: start.rect.x + Math.min(0, dx / zoom), y: start.rect.y + Math.min(0, dy / zoom), width: Math.abs(dx / zoom), height: Math.abs(dy / zoom) }, source.width, source.height, ratio));
      else setRect(resizeCrop(start.rect, start.kind, dx / zoom, dy / zoom, source.width, source.height, ratio));
    }}>
      {!source && <div className="crop-empty">选择或拖入一张图片<br /><small>PNG / JPG / BLP / TGA</small></div>}
      <div className="crop-image-plane" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}><canvas ref={canvas} />{source && <div className="crop-selection" data-handle="move" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, borderWidth: 1 / zoom }}>
        <div className="crop-thirds" data-handle="move" />{['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(handle => <span key={handle} data-handle={handle} className={`crop-handle crop-${handle}`} style={{ transform: `translate(-50%,-50%) scale(${1 / zoom})` }} />)}
      </div>}</div>
    </div>
    <p className="crop-help">拖动画框或八个控制点调整；空白处拉出新选框；滚轮缩放，Alt＋拖动平移。{source && ` 原图 ${source.width}×${source.height}，裁剪 ${rect.width}×${rect.height}`}</p>
    <div className="crop-fields"><label>比例<ThemeSelect label="裁剪比例" value={ratioName} options={[{ value: 'free', label: '自由' }, { value: 'original', label: '原图比例' }, { value: '1', label: '1:1' }, { value: String(4 / 3), label: '4:3' }, { value: String(16 / 9), label: '16:9' }]} onChange={value => { setRatioName(value); if (source) setRect(clampCrop(rect, source.width, source.height, value === 'original' ? source.width / source.height : value === 'free' ? 0 : Number(value))); }} /></label>
      {(['x', 'y', 'width', 'height'] as const).map((key, i) => <label key={key}>{['X', 'Y', '宽度', '高度'][i]}<input type="number" aria-label={`裁剪${key}`} disabled={!source || busy} min={key === 'x' || key === 'y' ? 0 : 1} value={rect[key]} onChange={e => { if (source) setRect(clampCrop({ ...rect, [key]: Number(e.target.value) }, source.width, source.height, ratio)); }} /></label>)}
      <label>输出格式<ThemeSelect label="裁剪输出格式" value={format} options={conversionFormats.map(value => ({ value, label: value.toUpperCase() }))} onChange={value => setFormat(value as ConversionFormat)} /></label></div>
    {error && <p role="alert" className="error-text">{error}</p>}{saved && <p role="status" className="crop-saved">已保存：{saved}</p>}
    <div className="dialog-actions"><span>另存裁剪结果，保留原文件；同名自动编号。</span><button disabled={busy} onClick={close}>关闭</button><button className="primary" disabled={!source || busy} onClick={() => void save()}><Save size={16} />{busy ? '处理中…' : '另存裁剪图'}</button></div>
  </Modal>;
}
