import { BatchHelp } from '../BatchHelp';

export function IconPairToggle({ enabled, update }: { enabled: boolean; update: (enabled: boolean) => void }) {
  return <div className="batch-text-option batch-icon-option">
    <label className="batch-text-toggle"><input type="checkbox" checked={enabled}
      onChange={event => update(event.target.checked)} />生成光暗图标</label>
    <BatchHelp label="生成光暗图标">每个图标输出正常和黑白暗图两份 BLP。选择目录后创建 ReplaceableTextures/CommandButtons 和 CommandButtonsDisabled，保持相同序号、尺寸和透明度。</BatchHelp>
    <small className="batch-icon-recommendation">推荐游戏图标勾选</small>
  </div>;
}
