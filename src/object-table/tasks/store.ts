import { create } from 'zustand';
import { newTaskSheets } from '../newTask';
import { useObjectTable, isObjectDirty, type State } from '../store';
import { customDataOnly, dataOnly, initialViews, type ObjectProject } from '../model';
import type { CellSelection } from '../ObjectGrid';
import { parseObjectProject } from '../project';
import { z } from 'zod';

export type TaskData = Pick<State, 'variables' | 'savedVariables' | 'pastVariables' | 'futureVariables' | 'bookId' | 'active' | 'sheets' | 'views' | 'path' | 'savedRows' | 'savedViews' | 'savedColumns' | 'pastBooks' | 'futureBooks' | 'metadata' | 'savedMetadata'>;
export interface ObjectTask { id: string; name: string; data: TaskData; selection: CellSelection; query: string; source?: string }
interface Tasks { tasks: ObjectTask[]; activeId: string | null }
let switching = false;
const firstSelection = (): CellSelection => ({ start: { row: 0, col: 0 }, end: { row: 0, col: 0 } });
function capture(s = useObjectTable.getState()): TaskData {
  const { variables, savedVariables, pastVariables, futureVariables, bookId, active, sheets, views, path, savedRows, savedViews, savedColumns, pastBooks, futureBooks, metadata, savedMetadata } = s;
  return { variables, savedVariables, pastVariables, futureVariables, bookId, active, sheets, views, path, savedRows, savedViews, savedColumns, pastBooks, futureBooks, metadata, savedMetadata };
}
export const taskDirty = (task: ObjectTask) => isObjectDirty(task.data as State);
const initial = capture();
export const useObjectTasks = create<Tasks>(() => ({ tasks: [{ id: initial.bookId, name: '未命名物编', data: initial, selection: firstSelection(), query: '' }], activeId: initial.bookId }));
export const pathIdentity = (path: string) => path.replaceAll('/', '\\').replace(/^\\\\\?\\/, '').toLowerCase();
export function taskProject(task: ObjectTask): ObjectProject {
  const { active, sheets, views, metadata, variables } = task.data;
  return { format: 'war3-objects', version: 3, variables, active, sheets: dataOnly(sheets), customSheets: customDataOnly(sheets), views, metadata: { ...metadata, name: task.name } };
}
function display(id: string | null) {
  const task = useObjectTasks.getState().tasks.find(t => t.id === id);
  switching = true;
  try {
    if (task) useObjectTable.setState(task.data);
    else useObjectTable.setState({ bookId: `closed:${crypto.randomUUID()}` });
    useObjectTasks.setState({ activeId: task?.id ?? null });
  } finally { switching = false; }
}
export const activateObjectTask = (id: string) => { if (useObjectTasks.getState().tasks.some(t => t.id === id)) display(id); };
export function openObjectTask(project?: ObjectProject, path: string | null = null, saved = true, name = '未命名物编', source?: string) {
  const existing = useObjectTasks.getState().tasks.find(t => path && t.data.path && pathIdentity(t.data.path) === pathIdentity(path) || source && t.source === source);
  const bound = project?.metadata?.binding;
  const sameMap = bound && useObjectTasks.getState().tasks.find(t => t.data.metadata?.binding && pathIdentity(t.data.metadata.binding.path) === pathIdentity(bound.path));
  if (existing || sameMap) { display((existing || sameMap)!.id); return (existing || sameMap)!.id; }
  switching = true;
  const title = project?.metadata?.name ?? path?.split(/[\\/]/).pop()?.replace(/\.war3objects$/i, '') ?? name;
  try { useObjectTable.getState().restore(project ? { ...project, metadata: { ...project.metadata, name: title } } : { format: 'war3-objects', version: 3, active: 'item', sheets: dataOnly(newTaskSheets()), views: initialViews(), metadata: { name } }, path, saved); }
  finally { switching = false; }
  const data = capture(), task: ObjectTask = { id: data.bookId, name: title, data, selection: firstSelection(), query: '', source };
  useObjectTasks.setState(s => ({ tasks: [...s.tasks, task], activeId: task.id }));
  return task.id;
}
export function updateObjectTask(id: string, patch: Partial<TaskData>) {
  const s = useObjectTasks.getState();
  if (!s.tasks.some(t => t.id === id)) return false;
  if (id === s.activeId) useObjectTable.setState(patch);
  else useObjectTasks.setState({ tasks: s.tasks.map(t => t.id === id ? { ...t, data: { ...t.data, ...patch } } : t) });
  return true;
}
export function closeObjectTask(id: string) {
  const s = useObjectTasks.getState(), index = s.tasks.findIndex(t => t.id === id);
  if (index < 0) return;
  const tasks = s.tasks.filter(t => t.id !== id); useObjectTasks.setState({ tasks });
  if (s.activeId === id) display(tasks[Math.min(index, tasks.length - 1)]?.id ?? null);
}
export function taskView(id: string, patch: Partial<Pick<ObjectTask, 'selection' | 'query'>>) {
  useObjectTasks.setState(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, ...patch } : t) }));
}
useObjectTable.subscribe((next, prev) => {
  if (switching || next === prev) return;
  const s = useObjectTasks.getState(), data = capture(next);
  if (next.bookId !== prev.bookId) {
    // External restore remains compatible with old callers and test fixtures.
    const task: ObjectTask = { id: next.bookId, name: next.metadata?.name ?? '未命名物编', data, selection: firstSelection(), query: '' };
    useObjectTasks.setState({ tasks: s.activeId ? s.tasks.map(t => t.id === s.activeId ? task : t) : [...s.tasks, task], activeId: task.id });
  } else if (s.activeId === next.bookId) useObjectTasks.setState({ tasks: s.tasks.map(t => t.id === next.bookId ? { ...t, data } : t) });
});
export function serializeObjectWorkspace() {
  const s = useObjectTasks.getState();
  return JSON.stringify({ format: 'war3-object-workspace', version: 2, activeId: s.activeId, tasks: s.tasks.map(t => ({ id: t.id, name: t.name, source: t.source, project: taskProject(t), path: t.data.path, dirty: taskDirty(t), selection: t.selection, query: t.query })) });
}
export function restoreObjectWorkspace(text: string) {
  const v = JSON.parse(text);
  const legacy = v.format !== 'war3-object-workspace';
  if (!legacy && (v.version !== 2 || !Array.isArray(v.tasks) || v.tasks.length > 100)) throw new Error('物编任务恢复格式无效');
  const point = z.object({ row: z.number().int().min(0).max(99999), col: z.number().int().min(0).max(511) });
  const entrySchema = z.object({ id: z.string().min(1).max(128), name: z.string().min(1).max(256), source: z.string().optional(), project: z.unknown(), path: z.string().nullable().optional(), dirty: z.boolean().optional(), selection: z.object({ start: point, end: point, ranges: z.array(z.object({ start: point, end: point })).max(10000).optional() }).optional(), query: z.string().max(10000).optional() });
  const entries = z.array(entrySchema).max(100).parse(legacy ? [{ ...v, id: crypto.randomUUID(), name: v.project?.metadata?.name ?? '恢复的物编' }] : v.tasks);
  // Validate the entire workspace before replacing any live state.
  const parsed = entries.map(e => ({ ...e, project: parseObjectProject(JSON.stringify(e.project)) }));
  if (new Set(parsed.map((e: { id: string }) => e.id)).size !== parsed.length) throw new Error('任务标识重复');
  switching = true;
  const previous = capture();
  try {
    const tasks: ObjectTask[] = parsed.map(e => {
      useObjectTable.getState().restore(e.project, e.path ?? null, !e.dirty);
      const activeSheet = e.project.sheets[e.project.active as keyof typeof e.project.sheets] ?? e.project.customSheets?.[e.project.active];
      const selection = e.selection && activeSheet && e.selection.end.col < activeSheet.columns.length && e.selection.start.col < activeSheet.columns.length && e.selection.ranges?.every(r => r.start.col < activeSheet.columns.length && r.end.col < activeSheet.columns.length) !== false ? e.selection : firstSelection();
      return { id: e.id, name: e.name, source: e.source, data: { ...capture(), bookId: e.id }, selection, query: e.query ?? '' };
    });
    useObjectTasks.setState({ tasks, activeId: null });
    useObjectTable.setState(previous);
    display(legacy ? tasks[0]?.id ?? null : tasks.some(t => t.id === v.activeId) ? v.activeId : tasks[0]?.id ?? null);
  } finally { switching = false; }
}
