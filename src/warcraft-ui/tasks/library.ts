import { invoke, isTauri } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { trackOperation } from '../runtime/operations';
import { parseDesign, serializeDesign } from './schema';
import { useUiTasks } from './store';
import type { DesignMeta, DirectoryInfo, SavedDesign } from './types';

export const useDesignLibrary = create<{ busy: boolean }>(() => ({ busy: false }));
const browserKey = 'box-warcraft-design-library-v1';
const browserRead = (): Record<string, string> => JSON.parse(localStorage.getItem(browserKey) || '{}');
export const designDirectory = (): Promise<DirectoryInfo> => isTauri() ? invoke('ui_design_directory') : Promise.resolve({ directory: '浏览器本地保存（桌面版可设置文件夹）', defaultDirectory: '', revision: 0 });
export async function listDesigns(): Promise<DesignMeta[]> {
  const designs = isTauri() ? await invoke<DesignMeta[]>('ui_design_list') : Object.values(browserRead()).map(parseDesign);
  return designs.sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function readDesign(id: string): Promise<SavedDesign> {
  const text = isTauri() ? await invoke<string>('ui_design_read', { id }) : browserRead()[id];
  if (!text) throw new Error('保存稿不存在');
  return parseDesign(text);
}
async function mutation<T>(work: () => Promise<T>): Promise<T> {
  if (useDesignLibrary.getState().busy) throw new Error('保存稿操作正在进行，请稍后重试');
  useDesignLibrary.setState({ busy: true });
  try { return await trackOperation(work); }
  finally { useDesignLibrary.setState({ busy: false }); }
}
export function writeDesign(design: SavedDesign): Promise<DesignMeta> {
  return mutation(async () => {
    const text = serializeDesign(design);
    if (isTauri()) return invoke<DesignMeta>('ui_design_save', { text });
    const files = browserRead(); files[design.id] = text; localStorage.setItem(browserKey, JSON.stringify(files));
    return { id: design.id, name: design.name, updatedAt: design.updatedAt };
  });
}
export function deleteDesign(id: string): Promise<void> {
  return mutation(async () => {
    if (isTauri()) await invoke('ui_design_delete', { id });
    else { const files = browserRead(); delete files[id]; localStorage.setItem(browserKey, JSON.stringify(files)); }
    useUiTasks.getState().detach(id);
  });
}
export function changeDesignDirectory(directory: string | null): Promise<DirectoryInfo> {
  return mutation(async () => {
    if (!isTauri()) throw new Error('请在桌面版中设置保存目录');
    const result = await invoke<DirectoryInfo>('ui_design_change_directory', { directory });
    if (result.remapped) useUiTasks.getState().remap(result.remapped);
    useUiTasks.setState({ directoryRevision: result.revision });
    return result;
  });
}
export function retryDesignCleanup(): Promise<DirectoryInfo> {
  return mutation(() => invoke('ui_design_retry_cleanup'));
}
