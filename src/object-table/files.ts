import { invoke, isTauri } from '@tauri-apps/api/core';
import { confirm, open, save } from '@tauri-apps/plugin-dialog';
import { currentProject, parseObjectProject, serializeObjectProject } from './project';
import { useObjectTable, isObjectDirty } from './store';
import { generateMacros } from './export';
import type { CategoryId } from './schema';
import { flushObjects } from './persistence';
import { synchronizePaletteDraft } from './palette/bridge';
import { openObjectTask, taskProject, taskDirty, updateObjectTask, useObjectTasks } from './tasks/store';
import { commitObjectEditor } from './commit';

function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function confirmObjectAction(message: string) {
  return isTauri() ? confirm(message, { title: '物编表格', kind: 'warning', okLabel: '确定', cancelLabel: '取消' }) : window.confirm(message);
}
export async function pickObjectFile(excel: boolean): Promise<{ blob: Blob; path: string | null } | null> {
  if (isTauri()) {
    const path = await open({ multiple: false, filters: [{ name: excel ? 'Excel 物编' : '物编工作簿', extensions: excel ? ['xlsx', 'xlsm'] : ['war3objects'] }] });
    if (typeof path !== 'string') return null;
    const data = await invoke<ArrayBuffer>('object_read_file', { path });
    return { blob: new Blob([data]), path };
  }
  return new Promise(resolve => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = excel ? '.xlsx,.xlsm' : '.war3objects';
    input.onchange = () => { const file = input.files?.[0]; resolve(file ? { blob: file, path: null } : null); };
    input.oncancel = () => resolve(null); input.click();
  });
}
export async function saveObjects(): Promise<boolean> {
  await synchronizePaletteDraft();
  commitObjectEditor();
  const state = useObjectTable.getState(), project = currentProject();
  const target = useObjectTasks.getState().tasks.find(t => t.id === state.bookId);
  if (!target) return false;
  const savedProject = taskProject(target);
  const baseline = Object.fromEntries(Object.entries(state.sheets).map(([id, sheet]) => [id, sheet.rows])) as typeof state.savedRows;
  let path = state.path;
  if (isTauri()) {
    path ??= await save({ defaultPath: '物编表格.war3objects', filters: [{ name: '物编工作簿', extensions: ['war3objects'] }] });
    if (!path) return false;
    await invoke('object_save_file', { path, text: serializeObjectProject(savedProject) });
  } else download(`${target.name}.war3objects`, new Blob([serializeObjectProject(savedProject)], { type: 'application/json' }));
  const columns = Object.fromEntries(Object.entries(state.sheets).map(([id, sheet]) => [id, sheet.columns])) as typeof state.savedColumns;
  updateObjectTask(target.id, { path, savedRows: baseline, savedViews: project.views, savedColumns: columns, savedMetadata: state.metadata, savedVariables: savedProject.variables });
  await flushObjects(false);
  const after = useObjectTasks.getState().tasks.find(t => t.id === target.id);
  return !!after && !taskDirty(after);
}
export async function guardObjects() {
  await synchronizePaletteDraft();
  commitObjectEditor();
  if (!useObjectTasks.getState().activeId) return true;
  if (!isObjectDirty(useObjectTable.getState())) return true;
  if (!await confirmObjectAction('当前工作簿有修改。保存后继续？选择取消将保留当前工作簿。')) return false;
  return saveObjects();
}
export async function openObjects() {
  if (!await guardObjects()) return;
  const file = await pickObjectFile(false); if (!file) return;
  const text = await file.blob.text(), project = parseObjectProject(text);
  const source = file.path ? undefined : `browser:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('')}`;
  const name = file.blob instanceof File ? file.blob.name.replace(/\.war3objects$/i, '') : '物编工作簿';
  openObjectTask(project, file.path, true, name, source);
}
export async function exportObjects(ids: CategoryId[]) {
  await synchronizePaletteDraft();
  commitObjectEditor();
  const files = generateMacros(currentProject(), ids);
  if (isTauri()) {
    const directory = await open({ directory: true, multiple: false }); if (typeof directory !== 'string') return null;
    const existing = await invoke<string[]>('object_export', { directory, files, overwrite: false });
    if (existing.length) {
      if (!await confirmObjectAction(`以下文件已存在，统一覆盖？\n${existing.join('\n')}`)) return null;
      await invoke('object_export', { directory, files, overwrite: true });
    }
  } else for (const file of files) download(file.name, new Blob([file.text], { type: 'text/plain;charset=utf-8' }));
  return files;
}
