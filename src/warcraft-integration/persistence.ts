import { invoke, isTauri } from '@tauri-apps/api/core';
import { useUiTasks, taskFrom } from '../warcraft-ui/tasks/store';
import { serializeSession, parseSession, recoverLinks } from '../warcraft-ui/tasks/schema';
import { listDesigns, designDirectory } from '../warcraft-ui/tasks/library';
const key = 'box-warcraft-document-v1';
let initialized: Promise<void> | undefined;
let writer = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;
let failure: unknown;
let restoreWarning = '';
export const warcraftRestoreWarning = () => restoreWarning;
const read = () => isTauri() ? invoke<string | null>('read_warcraft_workspace') : Promise.resolve(localStorage.getItem(key));
const write = async (text: string) => { if (isTauri()) await invoke('write_warcraft_workspace', { text }); else localStorage.setItem(key, text); };
export function initializeWarcraft() {
  return initialized ??= (async () => {
    const text = await read();
    const session = text ? parseSession(text) : (() => { const task = taskFrom(); return { tasks: [task], activeId: task.id, directoryRevision: 0 }; })();
    let revision = session.directoryRevision;
    try {
      const directory = await designDirectory(); revision = directory.revision;
      if (session.tasks.some(task => task.saved)) {
        session.tasks = recoverLinks(session.tasks, session.directoryRevision, directory.migrations);
        const existing = new Set((await listDesigns()).map(design => design.id));
        session.tasks = session.tasks.map(task => task.saved && !existing.has(task.saved.id) ? { ...task, saved: null, savedContent: null } : task);
      }
    } catch (error) {
      restoreWarning = `画布已恢复，保存稿目录暂时无法读取：${String(error)}。请检查 UI 设置和保存目录。`;
      session.tasks = session.tasks.map(task => ({ ...task, savedContent: null }));
    }
    useUiTasks.getState().restore(session.tasks, session.activeId, revision);
    useUiTasks.subscribe((next, prev) => {
      if (next.tasks === prev.tasks && next.activeId === prev.activeId && next.directoryRevision === prev.directoryRevision) return;
      dirty = true; clearTimeout(timer); timer = setTimeout(() => { void flushWarcraft().catch(() => {}); }, 300);
    });
  })();
}
export async function flushWarcraft() {
  await initialized;
  clearTimeout(timer);
  if (dirty) {
    const state = useUiTasks.getState();
    const text = serializeSession(state.tasks, state.activeId, state.directoryRevision); dirty = false;
    writer = writer.then(() => write(text)).then(() => { failure = undefined; }, error => { failure = error; dirty = true; });
  }
  await writer;
  if (failure) throw failure;
}
