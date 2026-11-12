import { parseDocument, serializeLayout } from '../project/file';
import { taskFrom } from './store';
import type { UiTask, SavedDesign, DirectoryInfo } from './types';
import { z } from 'zod';
import { defaultArrayName } from '../document/arrayName';

const meta = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(100), updatedAt: z.number().finite().nonnegative() });
export function recoverLinks(tasks: UiTask[], revision: number, migrations: DirectoryInfo['migrations']) {
  for (const migration of migrations ?? []) {
    if (migration.revision > revision) tasks = tasks.map(task => task.saved && migration.ids[task.saved.id] ? { ...task, saved: { ...task.saved, id: migration.ids[task.saved.id] } } : task);
  }
  return tasks;
}
export function serializeDesign(design: SavedDesign): string {
  meta.parse(design);
  return JSON.stringify({ ...JSON.parse(serializeLayout(design.document.nodes, design.document.arrayName, design.document.background)), design: { id: design.id, name: design.name, updatedAt: design.updatedAt } }, null, 2);
}
export function parseDesign(text: string): SavedDesign {
  const data = JSON.parse(text);
  return { ...meta.parse(data.design), document: parseDocument(text) };
}
export function serializeSession(tasks: UiTask[], activeId: string | null, directoryRevision = 0): string {
  const active = tasks.find(task => task.id === activeId);
  return JSON.stringify({ ...JSON.parse(serializeLayout(active?.nodes ?? [], active?.arrayName ?? defaultArrayName, active?.background ?? null)), session: {
    version: 1, activeId, directoryRevision, tasks: tasks.map(task => ({ id: task.id, name: task.name,
      document: JSON.parse(serializeLayout(task.nodes, task.arrayName, task.background)),
      saved: task.saved, savedContent: task.savedContent, view: task.view })),
  } });
}
export function parseSession(text: string): { tasks: UiTask[]; activeId: string | null; directoryRevision: number } {
  const value = JSON.parse(text);
  if (!value.session) {
    const task = taskFrom(parseDocument(text));
    return { tasks: [task], activeId: task.id, directoryRevision: 0 };
  }
  const data = z.object({ version: z.literal(1), activeId: z.string().min(1).nullable(), directoryRevision: z.number().int().nonnegative().default(0), tasks: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1).max(100), document: z.unknown(),
    saved: meta.nullable(), savedContent: z.string().nullable(),
    view: z.object({ grid: z.boolean(), snap: z.boolean(), boundary: z.boolean(), guides: z.boolean(), highlight: z.boolean(), selection: z.boolean(), hiddenFrames: z.boolean(), zoom: z.number().min(.1).max(2).nullable(), panX: z.number().finite().default(0), panY: z.number().finite().default(0), background: z.string().nullable() }),
  })) }).parse(value.session);
  const validActive = data.tasks.length ? data.tasks.some(task => task.id === data.activeId) : data.activeId === null;
  if (new Set(data.tasks.map(task => task.id)).size !== data.tasks.length || !validActive) throw new Error('UI 任务数据无效');
  const savedIds = data.tasks.flatMap(task => task.saved ? [task.saved.id] : []);
  if (new Set(savedIds).size !== savedIds.length) throw new Error('保存稿关联重复');
  return { activeId: data.activeId, directoryRevision: data.directoryRevision, tasks: data.tasks.map(task => {
    if (task.savedContent !== null) {
      const baseline = JSON.parse(task.savedContent);
      parseDocument(serializeLayout(baseline.nodes, baseline.arrayName, baseline.background));
    }
    return { ...taskFrom(parseDocument(JSON.stringify(task.document)), task.name), ...task, ...parseDocument(JSON.stringify(task.document)) };
  }) };
}
