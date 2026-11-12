import type { UiNode } from '../document/model';
import { gridCount } from '../document/grid';
import { useLayoutStore } from '../state/layout';

export function GridProperties({ node, onMessage }: { node: UiNode; onMessage: (message: string) => void }) {
  const setNode = useLayoutStore(state => state.setNode);
  if (!['text', 'button'].includes(node.kind)) return null;
  const update = (grid: UiNode['grid']) => {
    if (grid?.materials) grid = { ...grid, materials: Object.fromEntries(Object.entries(grid.materials).filter(([key]) => {
      const [row, column] = key.split(':').map(Number);
      return row < grid!.rows && column < grid!.columns;
    })) };
    setNode(node.id, { grid });
    if (useLayoutStore.getState().nodes.find(item => item.id === node.id) === node) onMessage('多行多列未更新：请检查数量（总计最多 512 个）和 Frame 数组下标');
  };
  return <div className="grid-properties">
    <label className="check-field"><input aria-label="多行多列" type="checkbox" checked={!!node.grid}
      onChange={event => update(event.target.checked ? { rows: 2, columns: 4, gapX: 12, gapY: 12 } : undefined)} />多行多列</label>
    {node.grid && <><div className="field-grid">{(['rows', 'columns', 'gapX', 'gapY'] as const).map((key, index) => <label key={key}>
      {['行数', '列数', '横向间距', '纵向间距'][index]}<input aria-label={['行数', '列数', '横向间距', '纵向间距'][index]} type="number"
        min={index < 2 ? 1 : 0} max={index < 2 ? 512 : undefined} step={index < 2 ? 1 : 0.5} value={node.grid![key]}
        onChange={event => { if (event.target.value) update({ ...node.grid!, [key]: Number(event.target.value) }); }} /></label>)}</div>
      <div className="variable-name">共 {gridCount(node)} 个，按行编号；修改属性会应用到整组。<br />导出 T 可选择逐条生成或循环生成。</div></>}
  </div>;
}
