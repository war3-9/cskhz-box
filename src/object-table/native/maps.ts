import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { mapReadSchema } from '../sync/schema';
import { updateObjectTask, useObjectTasks, pathIdentity } from '../tasks/store';
import { mapProject, resolveString } from './mapping';
import type { MapRead, ObjectSnapshot } from '../sync/types';
import { applyNativeObject } from './mapping';
import { categories, type CategoryId } from '../schema';
import { equal } from '../sync/reconcile';

export async function readObjectMap(path?: string) {
  if (!isTauri()) throw new Error('编辑器连接与地图读取仅桌面版可用；浏览器可使用多任务和工作簿文件。');
  const selected = path ?? await open({ title: '只读关联地图', multiple: false, filters: [{ name: '魔兽地图', extensions: ['w3x', 'w3m'] }] });
  if (typeof selected !== 'string') return null;
  return mapReadSchema.parse(await invoke('object_map_read', { path: selected }));
}
export const customSnapshot = (map: MapRead, include = new Set<string>()): ObjectSnapshot => Object.fromEntries(Object.entries(map.objects).filter(([key, obj]) => obj.custom || include.has(key)).map(([key, object]) => [key, { ...object, fields: Object.fromEntries(Object.entries(object.fields).map(([field, value]) => [field, { ...value, value: typeof value.value === 'string' ? resolveString(value.value, map.strings) : value.value }])) }]));
export function applyTaskSnapshot(id: string, snapshot: ObjectSnapshot, before: ObjectSnapshot) {
  const task = useObjectTasks.getState().tasks.find(t => t.id === id); if (!task) throw new Error('任务已关闭，未应用读取结果');
  let sheets = { ...task.data.sheets }; let changed = false;
  for (const key of new Set([...Object.keys(snapshot), ...Object.keys(before)])) {
    if (equal(snapshot[key], before[key])) continue;
    const kind = key.split(':')[0] as CategoryId; if (!categories.some(c => c.id === kind)) throw new Error('未知物编分类');
    const sheet = sheets[kind];
    sheets = { ...sheets, [kind]: { ...sheet, ...applyNativeObject(sheet, snapshot[key], kind, key.slice(kind.length + 1)) } }; changed = true;
  }
  if (changed) updateObjectTask(id, { sheets, pastBooks: [...task.data.pastBooks.slice(-79), task.data.sheets], futureBooks: [] });
}
export function bindTask(id: string, map: MapRead) {
  const task = useObjectTasks.getState().tasks.find(t => t.id === id); if (!task) throw new Error('目标任务已关闭');
  const existing = useObjectTasks.getState().tasks.find(t => t.id !== id && t.data.metadata?.binding && pathIdentity(t.data.metadata.binding.path) === pathIdentity(map.path));
  if (existing) throw new Error(`此地图已关联任务“${existing.name}”，请激活已有标签`);
  const metadata = mapProject(map).metadata!;
  const managedIds = new Set(categories.flatMap(({ id }) => task.data.sheets[id].rows.map(row => `${id}:${row.cells[task.data.sheets[id].columns[0].key] ?? ''}`)));
  const baseline = customSnapshot(map, managedIds);
  const previous = task.data.metadata?.binding;
  const bindingId = previous && pathIdentity(previous.path) === pathIdentity(map.path) && previous.fingerprint === map.fingerprint ? previous.id : metadata.binding!.id;
  updateObjectTask(id, { metadata: { ...metadata, name: task.name, binding: { ...metadata.binding!, id: bindingId, baseline, managed: Object.fromEntries(Object.entries(baseline).map(([key, obj]) => [key, Object.keys(obj.fields)])) } } });
}
