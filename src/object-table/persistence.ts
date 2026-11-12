import { invoke, isTauri } from '@tauri-apps/api/core';
import { get, set } from 'idb-keyval';
import { create } from 'zustand';
import { restoreObjectWorkspace, serializeObjectWorkspace, useObjectTasks } from './tasks/store';
import { useUi } from '../app/uiStore';
import { synchronizePaletteDraft } from './palette/bridge';
import { RecoveryQueue } from './settings/RecoveryQueue';
import { checkPreferencePersistence, useObjectPreferences } from './settings/store';
import { commitObjectEditor } from './commit';

let initialized: Promise<void> | undefined;
const key = 'box-object-table-v1';
export const useObjectSaveStatus = create<{ phase: 'idle' | 'pending' | 'saving' | 'error'; lastSaved: number | null; error: string }>(() => ({ phase: 'idle', lastSaved: null, error: '' }));
const queue = new RecoveryQueue(() => useObjectPreferences.getState(), async () => {
  useObjectSaveStatus.setState({ phase: 'saving', error: '' });
  const text = serializeObjectWorkspace();
  try {
    await (isTauri() ? invoke<void>('object_write_workspace', { text }) : set(key, text));
    useObjectSaveStatus.setState({ phase: 'idle', lastSaved: Date.now(), error: '' });
  } catch (error) { useObjectSaveStatus.setState({ phase: 'error', error: String(error) }); throw error; }
}, error => useUi.getState().notify(`物编表格自动保存失败：${String(error)}`, 'error'));
useObjectPreferences.subscribe((next, prev) => { if (next.realtime !== prev.realtime || next.intervalSeconds !== prev.intervalSeconds) queue.schedule(); });
export function initializeObjects() {
  return initialized ??= (async () => {
    try {
      const text = isTauri() ? await invoke<string | null>('object_read_workspace') : await get<string>(key);
      if (text) {
        restoreObjectWorkspace(text);
      }
    } catch (error) { useUi.getState().notify(`物编表格恢复失败：${String(error)}`, 'error'); throw error; }
    useObjectTasks.subscribe((next, prev) => {
      if (next.activeId === prev.activeId && next.tasks.length === prev.tasks.length && next.tasks.every((task, index) => task.data === prev.tasks[index]?.data && task.name === prev.tasks[index]?.name)) return;
      useObjectSaveStatus.setState({ phase: 'pending' });
      queue.changed();
    });
  })().catch(error => { initialized = undefined; throw error; });
}
export async function flushObjects(commitEditor = true) {
  if (commitEditor) await synchronizePaletteDraft();
  if (commitEditor && typeof window !== 'undefined') commitObjectEditor();
  await initialized;
  checkPreferencePersistence();
  if (commitEditor && isTauri()) await invoke('object_palette_remember');
  await queue.flush();
}
