import { StyledSelect } from '../../shared/components/StyledSelect';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Pause, Play, RotateCcw, SkipForward, Star } from 'lucide-react';
import { defaultCamera, useViewer } from '../workspace/store';
import { loadModel } from '../resources/models';
import { decodeTexture } from '../resources/textures';
import { readResource } from '../resources/providers';
import { ModelCanvas } from '../renderer/ModelCanvas';
import { basename, isTexture, resourceKey, type LoadedModel } from '../types';
import { ExportDialog } from '../export/ExportDialog';
import { initialCamera, sequenceFor } from '../renderer/engine';
import { Dependencies } from './Dependencies';
import { TexturePreview } from './TexturePreview';
import { CaptureControls } from './CaptureControls';
export function ModelDetail({ active }: { active: boolean }) {
  const state = useViewer(), [loaded, setLoaded] = useState<LoadedModel>(), [image, setImage] = useState(''), [error, setError] = useState(''), [exporting, setExporting] = useState(false);
  const captureRef = useRef<(() => Promise<Blob>) | undefined>(undefined);
  const ref = state.current, source = state.sources.find(s => s.id === ref?.sourceId);
  const entry = source?.entries.find(e => e.path === ref?.path);
  const [textureSize, setTextureSize] = useState('');
  useEffect(() => { if (!ref) return; let alive = true; setLoaded(undefined); setImage(''); setError('');
    const run = async () => { if (isTexture(ref.path)) { const [data] = await decodeTexture(await readResource(ref), ref.path); const canvas = document.createElement('canvas'); canvas.width = data.width; canvas.height = data.height; canvas.getContext('2d')!.putImageData(data, 0, 0); if (alive) { setImage(canvas.toDataURL()); setTextureSize(`${data.width} × ${data.height}`); } }
      else { const model = await loadModel(ref); if (alive) { const current = useViewer.getState(); if (current.frame === 0 && current.sequence === 0 && model.model.Sequences.length) { const sequence = sequenceFor(model.model, current.settings.action); current.patch({ sequence, frame: model.model.Sequences[sequence].Interval[0] }); } if (Object.entries(defaultCamera).every(([key, value]) => current.camera[key as keyof typeof defaultCamera] === value)) current.patch({ camera: initialCamera(model.model) }); setLoaded(model); } } };
    void run().catch(value => alive && setError(String(value))); return () => { alive = false; };
  }, [ref?.sourceId, ref?.path, state.revision]);
  if (!ref || !source) return null;
  const name = state.exportNames[resourceKey(source, ref.path)] || entry?.terrain?.name || basename(ref.path);
  const sequence = loaded?.model.Sequences[state.sequence], interval = sequence?.Interval || [0, 1];
  const reset = () => state.patch({ frame: interval[0], seek: state.seek + 1 });
  return <section className="viewer-detail-page"><header className="viewer-detail-toolbar"><button onClick={() => state.patch({ detail: false })}><ArrowLeft size={17} />返回浏览</button><strong title={ref.path}>{name}</strong><span /><button title="收藏" onClick={() => state.favorite(resourceKey(source, ref.path))}><Star size={17} /></button><button onClick={() => setExporting(true)}><Download size={17} />导出</button></header>
    <div className="viewer-detail-body"><div className="viewer-detail-viewport">{loaded ? <ModelCanvas loaded={loaded} active={active} captureRef={captureRef} /> : image ? <TexturePreview image={image} name={ref.path} /> : <div className="viewer-empty-state">{error || '正在读取资源…'}</div>}</div>
      <aside className="viewer-detail-controls"><h3>动作序列</h3><StyledSelect aria-label="模型动画" value={state.sequence} disabled={!loaded?.model.Sequences.length} onChange={e => { const index = Number(e.target.value); state.patch({ sequence: index, frame: loaded!.model.Sequences[index].Interval[0], seek: state.seek + 1, playing: true }); }}>{loaded?.model.Sequences.length ? loaded.model.Sequences.map((s, i) => <option key={i} value={i}>{s.Name}</option>) : <option value={0}>静态</option>}</StyledSelect>
        <div className="viewer-playback"><button title={state.playing ? '暂停' : '播放'} onClick={() => state.patch({ playing: !state.playing, ...(!state.playing && state.frame >= interval[1] ? { frame: interval[0], seek: state.seek + 1 } : {}) })}>{state.playing ? <Pause size={18} /> : <Play size={18} />}</button><button title="重置动作" onClick={reset}><RotateCcw size={18} /></button><button title="单步" onClick={() => state.patch({ playing: false, frame: Math.min(interval[1], state.frame + 40), seek: state.seek + 1 })}><SkipForward size={18} /></button><button onClick={() => state.patch({ camera: loaded ? initialCamera(loaded.model) : { ...defaultCamera } })}>重置视角</button><CaptureControls captureRef={captureRef} name={name} enabled={!!loaded && active} /></div>
        <input className="viewer-timeline" aria-label="模型时间轴" type="range" min={interval[0]} max={interval[1]} value={Math.max(interval[0], Math.min(interval[1], state.frame))} onChange={e => state.patch({ frame: Number(e.target.value), playing: false, seek: state.seek + 1 })} /><small>{Math.round(state.frame)} / {interval[1]} ms</small>
        <label>播放速度 <output>{state.settings.speed.toFixed(1)}x</output><input type="range" min="0.1" max="3" step="0.1" value={state.settings.speed} onChange={e => state.configure({ speed: Number(e.target.value) })} /></label><label className="viewer-checkbox"><input type="checkbox" checked={state.settings.loop} onChange={e => state.configure({ loop: e.target.checked })} />循环播放</label>
        <h3>外观设置</h3><label className="viewer-color-row">队伍颜色<input type="color" value={state.settings.team} onChange={e => state.configure({ team: e.target.value })} /></label><label className="viewer-color-row">背景颜色<input type="color" value={state.settings.background} onChange={e => state.configure({ background: e.target.value })} /></label>
        <h3>模型信息</h3><dl><dt>格式</dt><dd>{loaded ? `MDX / MDL v${loaded.model.Version}` : error.includes('MDB3') ? 'MDB3（特殊模型）' : error.includes('BLX1') ? 'BLX1（特殊贴图）' : isTexture(ref.path) ? '贴图' : 'MDX / MDL'}</dd><dt>名称</dt><dd title={ref.path}>{name}</dd>{loaded?.model.Info.Name && <><dt>内部名称</dt><dd>{loaded.model.Info.Name}</dd></>}<dt>动画</dt><dd>{loaded?.model.Sequences.length ?? '—'}</dd><dt>网格</dt><dd>{loaded?.model.Geosets.length ?? '—'}</dd><dt>来源</dt><dd title={source.path}>{source.name}</dd></dl>
        {entry?.terrain && <dl><dt>纹理类型</dt><dd>{entry.terrain.terrainType}</dd><dt>使用状态</dt><dd>{entry.terrain.used ? '地图使用' : '地图内未使用'}</dd><dt>资源来源</dt><dd>{entry.terrain.missing ? '资源缺失' : entry.readRef ? '游戏原生' : '地图资源（优先）'}</dd><dt>路径</dt><dd style={{overflowWrap:'anywhere'}}>{ref.path}</dd></dl>}
        {loaded ? <Dependencies loaded={loaded} replace={setLoaded} /> : image && <dl><dt>尺寸</dt><dd>{textureSize}</dd><dt>编码</dt><dd>{ref.path.split('.').pop()?.toUpperCase()}</dd></dl>}
      </aside></div>{exporting && <ExportDialog close={() => setExporting(false)} />}
  </section>;
}
