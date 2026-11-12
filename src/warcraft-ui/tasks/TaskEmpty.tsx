import { FilePlus2 } from 'lucide-react';
import type { TaskActions } from './useTaskActions';

export function TaskEmpty({ actions }: { actions: TaskActions }) {
  return <section className="canvas-panel ui-task-empty" aria-label="没有打开的 UI 任务">
    <p>没有打开的 UI 设计任务</p>
    <button className="primary" disabled={actions.busy} onClick={actions.create}><FilePlus2 size={18} />新建 UI 任务</button>
    <p>也可以从左侧“保存列表”打开已有设计。</p>
  </section>;
}
