import { StyledSelect } from '../../shared/components/StyledSelect';
import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { UiNode } from '../document/model';
import { useLayoutStore } from '../state/layout';
import { attachTexture, updateTexture } from './texture';
import { gridCount, gridMaterialKey } from '../document/grid';

export function TextureProperties({ node, onMessage }: { node: UiNode; onMessage: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<'all' | 'cell'>('all');
  const [selectedCell, setSelectedCell] = useState(0);
  const setNode = useLayoutStore(state => state.setNode);
  const grid = node.kind === 'button' ? node.grid : undefined;
  const cell = grid && scope === 'cell' ? Math.min(selectedCell, gridCount(node) - 1) : undefined;
  const own = cell !== undefined ? grid!.materials?.[gridMaterialKey(cell, grid!.columns)] : undefined;
  const current = own ?? node;
  const update = (texture: string, imageData?: string) => updateTexture(node.id, { texture, imageData }, cell);
  return <div className="texture-properties">
    {grid && <><label>素材设置<StyledSelect aria-label="素材设置" value={scope} disabled={busy} onChange={event => setScope(event.target.value as typeof scope)}>
      <option value="all">统一素材</option><option value="cell">单格素材</option></StyledSelect></label>
      {cell !== undefined && <label>选择格子<StyledSelect aria-label="选择格子" value={cell} disabled={busy} onChange={event => setSelectedCell(Number(event.target.value))}>
        {Array.from({ length: gridCount(node) }, (_, index) => <option key={index} value={index}>第 {Math.floor(index / grid.columns) + 1} 行 · 第 {index % grid.columns + 1} 列（第 {index + 1} 格）</option>)}
      </StyledSelect></label>}
      <div className="variable-name">统一素材作为默认，单格设置优先。{cell !== undefined && (own ? '当前格子已单独设置。' : '当前格子沿用统一素材。')}</div>
      {cell !== undefined ? <button className="command" disabled={busy || !own} onClick={() => updateTexture(node.id, null, cell)}>恢复统一素材</button> :
        <button className="command" disabled={busy || !Object.keys(grid.materials ?? {}).length} onClick={() => setNode(node.id, { grid: { ...grid, materials: undefined } })}>全部格子恢复统一素材</button>}
    </>}
    <label>素材图片</label>
    <div className="texture-actions">
      <button title={current.imageData ? '替换素材图片' : '添加素材图片'} aria-label="添加素材图片" disabled={busy} onClick={() => input.current?.click()}>
        <ImagePlus size={17} />{current.imageData ? '替换图片' : '添加图片'}</button>
      <button title="清除素材图片" aria-label="清除素材图片" disabled={busy || (!current.imageData && !current.texture)}
        onClick={() => update('')}><Trash2 size={17} /></button>
    </div>
    {current.imageData && <img className="texture-thumbnail" src={current.imageData} alt="当前素材" />}
    <label>地图贴图路径<input aria-label="地图贴图路径" value={current.texture ?? ''}
      onChange={event => update(event.target.value, current.imageData)} /></label>
    <input hidden type="file" accept="image/png,image/jpeg,image/webp" ref={input} data-testid="texture-file" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      setBusy(true);
      try { await attachTexture(node.id, file, cell); onMessage('素材已添加；地图中请导入对应 BLP，并核对贴图路径。'); }
      catch (error) { onMessage(String(error)); }
      finally { setBusy(false); }
    }} />
  </div>;
}
