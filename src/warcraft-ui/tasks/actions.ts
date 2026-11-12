import { useUiTasks } from './store';
import { documentContent, isTaskDirty, type SavedDesign, type DesignMeta } from './types';
import { writeDesign } from './library';

export async function saveTask(id: string, requestedName: string, write: (design: SavedDesign) => Promise<DesignMeta> = writeDesign) {
  const task = useUiTasks.getState().tasks.find(item => item.id === id);
  if (!task) throw new Error('任务已关闭');
  const name = requestedName.trim();
  if (!name || name.length > 100) throw new Error('设计名称应为 1–100 个字符');
  const document = { nodes: task.nodes, arrayName: task.arrayName, background: task.background };
  const saved = await write({ id: task.saved?.id ?? crypto.randomUUID(), name, updatedAt: Date.now(), document });
  useUiTasks.getState().markSaved(id, saved, documentContent(document));
  return !isTaskDirty(useUiTasks.getState().tasks.find(item => item.id === id)!);
}
