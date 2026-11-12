import { StyledSelect } from '../../shared/components/StyledSelect';
import { Copy, X } from 'lucide-react';
import { basename } from '../types';
import type { ExhibitScene, ItemOptions } from './scene';
export function SelectionPanel({ item, count = 1, change, close }: { item: NonNullable<ReturnType<ExhibitScene['item']>>; count?: number; change: (value: Partial<ItemOptions>) => void; close: () => void }) {
  const { loaded, options } = item;
  return <aside className="viewer-scene-controls" aria-label="选中模型设置"><h3 title={loaded.ref.path}>{basename(loaded.ref.path)}<button aria-label="取消模型选择" onClick={close}><X size={16} /></button></h3>
    {count > 1 && <p role="status">已选中 {count} 个模型，设置应用于全部选中模型。</p>}
    <button onClick={() => void navigator.clipboard.writeText(basename(loaded.ref.path)).catch(() => {})}><Copy size={14} />复制模型名</button>
    <label>动作序列<StyledSelect aria-label="选中模型动作" value={options.sequence} disabled={!loaded.model.Sequences.length} onChange={e => change({ sequence: Number(e.target.value) })}>{loaded.model.Sequences.length ? loaded.model.Sequences.map((sequence, index) => <option key={index} value={index}>[{index + 1}] {sequence.Name}{sequence.NonLooping ? '' : '　循环'}</option>) : <option value="0">静态</option>}</StyledSelect></label>
    <label>动画速度：{options.speed.toFixed(1)}<input aria-label="选中模型动画速度" type="range" min="0" max="5" step=".1" value={options.speed} onChange={e => change({ speed: Number(e.target.value) })} /></label>
    <label>模型高度：{options.height.toFixed(0)}<input aria-label="选中模型高度" type="range" min="-1000" max="2000" step="10" value={options.height} onChange={e => change({ height: Number(e.target.value) })} /></label>
    <label>模型缩放：{options.scale.toFixed(2)}<input aria-label="选中模型缩放" type="range" min=".05" max="5" step=".05" value={options.scale} onChange={e => change({ scale: Number(e.target.value) })} /></label>
    <dl><dt>位置</dt><dd>{item.position.x.toFixed(0)}, {item.position.y.toFixed(0)}</dd><dt>动作 / 贴图</dt><dd>{loaded.model.Sequences.length} / {loaded.model.Textures.length}</dd><dt>模型大小</dt><dd>{(loaded.bytes.byteLength / 1024).toFixed(1)} KB</dd></dl>
    {loaded.warning && <small role="status">{loaded.warning}</small>}<button onClick={() => change({ x: 0, y: 0, height: 0, scale: 1, speed: 1 })}>重置位置与外观</button><small>按住模型拖动位置；Ctrl＋左键拖动旋转视角；右键拖动整体位置。</small>
  </aside>;
}
