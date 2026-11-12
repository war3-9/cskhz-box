import { StyledSelect } from '../../shared/components/StyledSelect';
import { useLayoutStore } from '../state/layout';
import { SlidersHorizontal } from 'lucide-react';
import type { AnchorPoint } from '../document/model';
import { descendants } from '../document/relations';
import { frameName, frameVariable } from '../document/frameVariables';
import { anchorOffset, atOffset } from '../document/position';
import { defaultMapFont, hasText } from '../output/geometry';
import { TextureProperties } from './TextureProperties';
import { supportsTexture } from './texture';
import { DesignBackgroundField } from './DesignBackgroundField';
import { GridProperties } from './GridProperties';
import { frameRangeEnd } from '../document/grid';

const anchors: AnchorPoint[] = ['TOPLEFT', 'TOP', 'TOPRIGHT', 'LEFT', 'CENTER', 'RIGHT', 'BOTTOMLEFT', 'BOTTOM', 'BOTTOMRIGHT'];
const labels: Record<AnchorPoint, string> = { TOPLEFT: '左上', TOP: '上', TOPRIGHT: '右上', LEFT: '左', CENTER: '中心', RIGHT: '右', BOTTOMLEFT: '左下', BOTTOM: '下', BOTTOMRIGHT: '右下' };

export function Inspector({ onMessage }: { onMessage: (message: string) => void }) {
  const nodes = useLayoutStore(state => state.nodes);
  const arrayName = useLayoutStore(state => state.arrayName);
  const node = useLayoutStore((state) => state.nodes.find((item) => item.id === state.selectedId));
  const setNode = useLayoutStore((state) => state.setNode);
  const offset = node ? anchorOffset(node, nodes.find(item => item.id === node.parentId)) : { x: 0, y: 0 };
  return <section className="inspector"><h2><SlidersHorizontal size={19} />属性</h2>{node ? <>
    <label>名称<input aria-label="名称" placeholder={node.autoName} value={node.name} onChange={(e) => setNode(node.id, { name: e.target.value })} /></label>
    <div className="variable-name">Frame：<code>{frameName(node)}</code><br />T 数组：<code>{frameVariable(node, arrayName)}{node.grid && ` – ${arrayName}[${frameRangeEnd(node)}]`}</code></div>
    <div className="field-grid">{(['x', 'y', 'width', 'height'] as const).map((key, index) => <label key={key}>
      {['X', 'Y', '宽', '高'][index]}<input aria-label={['X', 'Y', '宽', '高'][index]} type="number"
        value={node[key]} min={index > 1 ? 1 : undefined} onChange={(e) => {
          if (e.target.value) setNode(node.id, { [key]: Number(e.target.value) });
        }} /></label>)}</div>
    <label>类型<StyledSelect aria-label="类型" value={node.kind} onChange={(e) => setNode(node.id, { kind: e.target.value as typeof node.kind,
      ...(!['text', 'button'].includes(e.target.value) ? { grid: undefined } : e.target.value === 'text' && node.grid ? { grid: { ...node.grid, materials: undefined } } : {}) })}>
      <option value="panel">面板</option><option value="background">背景</option><option value="button">按钮</option><option value="text">文字</option>
      {node.kind === 'backdrop' && <option value="backdrop">面板（旧工程）</option>}
    </StyledSelect></label>
    <GridProperties node={node} onMessage={onMessage} />
    <label>父级控件<StyledSelect aria-label="父级控件" value={node.parentId ?? ''} onChange={(e) => setNode(node.id, { parentId: e.target.value || undefined })}>
      <option value="">游戏界面</option>{nodes.filter(item => item.id !== node.id && !descendants(nodes, node.id).has(item.id)).map(item => <option key={item.id} value={item.id}>{frameName(item)}</option>)}
    </StyledSelect></label>
    <div className="field-grid"><label>自身锚点<StyledSelect aria-label="自身锚点" value={node.selfAnchor ?? 'TOPLEFT'} onChange={(e) => setNode(node.id, { selfAnchor: e.target.value as AnchorPoint })}>{anchors.map(anchor => <option key={anchor} value={anchor}>{labels[anchor]}</option>)}</StyledSelect></label>
      <label>目标锚点<StyledSelect aria-label="目标锚点" value={node.targetAnchor ?? 'TOPLEFT'} onChange={(e) => setNode(node.id, { targetAnchor: e.target.value as AnchorPoint })}>{anchors.map(anchor => <option key={anchor} value={anchor}>{labels[anchor]}</option>)}</StyledSelect></label></div>
    <div className="field-grid">{(['x', 'y'] as const).map(axis => <label key={axis}>偏移 {axis.toUpperCase()}
      <input aria-label={`偏移 ${axis.toUpperCase()}`} title="自身锚点相对目标锚点的像素偏移，X 向右，Y 向下" type="number" step="0.5" value={offset[axis]}
        onChange={event => { if (event.target.value) { const point = atOffset(node, { ...offset, [axis]: Number(event.target.value) }, nodes.find(item => item.id === node.parentId)); setNode(node.id, { x: point.x, y: point.y }); } }} /></label>)}</div>
    <button className="command" aria-label="锚点归位" title="将偏移 X/Y 归零，对齐当前自身和目标锚点" disabled={node.locked} onClick={() => {
      const point = atOffset(node, { x: 0, y: 0 }, nodes.find(item => item.id === node.parentId));
      setNode(node.id, { x: point.x, y: point.y });
    }}>锚点归位</button>
    <div className="field-grid"><label>透明度<input aria-label="透明度" type="number" min="0" max="1" step="0.05" value={node.opacity ?? 1} onChange={(e) => setNode(node.id, { opacity: Number(e.target.value) })} /></label>
      <label className="check-field"><input aria-label="可见" type="checkbox" checked={node.visible !== false} onChange={(e) => setNode(node.id, { visible: e.target.checked })} />可见</label></div>
    <DesignBackgroundField node={node} />
    <label className="check-field"><input aria-label="锁定" type="checkbox" checked={node.locked === true} onChange={(e) => setNode(node.id, { locked: e.target.checked })} />锁定位置</label>
    {hasText(node) && <label>文字颜色<input aria-label="颜色" type="color" value={node.textColor ?? node.color} onChange={(e) => setNode(node.id, { color: e.target.value, textColor: e.target.value })} /></label>}
    {supportsTexture(node) && <TextureProperties key={node.id} node={node} onMessage={onMessage} />}
    {hasText(node) && <><label>文字<textarea aria-label="文字" value={node.text ?? ''} onChange={(e) => setNode(node.id, { text: e.target.value })} /></label>
      <label>字体大小<input aria-label="字体大小" type="number" min="1" max="1080" value={node.fontSize ?? 54} onChange={e => setNode(node.id, { fontSize: Number(e.target.value) })} /></label>
      <label>地图字体路径<input aria-label="地图字体路径" value={node.fontPath ?? defaultMapFont} onChange={e => setNode(node.id, { fontPath: e.target.value })} /></label>
      {/[\u3400-\u9fff]/.test(node.text ?? '') && /FRIZQT__\.TTF$/i.test(node.fontPath ?? '') &&
        <><div className="variable-name">当前字体可能不含中文字形，可改用 {defaultMapFont} 或地图中导入的中文字体。</div>
          <button className="command" onClick={() => setNode(node.id, { fontPath: defaultMapFont })}>使用默认中文字体</button></>}</>}
  </> : <div className="empty-state inspector-empty"><SlidersHorizontal size={34} /><strong>未选中控件</strong></div>}</section>;
}
