import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { get, set } from 'idb-keyval';
import { create } from 'zustand';
import { useLibrary } from './store';
import { importImage } from '../shared/image';
import { useUi } from '../app/uiStore';
import type { Asset, Category } from '../shared/types';

export interface FolderBinding { id: string; path: string; name: string; seen: Record<string, string> }
interface Snapshot { name: string; path: string; children: { id: string; name: string; files: { id: string; path: string; name: string; revision: string }[] }[] }
export const useFolderLibrary = create<{ bindings: FolderBinding[]; errors: Record<string, string>; busy: boolean }>(() => ({ bindings: [], errors: {}, busy: false }));
const key = 'box-folder-library-v1', running = new Map<string, Promise<void>>();
const again = new Set<string>();
let initialized: Promise<void> | undefined, writes: Promise<unknown> = Promise.resolve();
const persist = () => { const value = structuredClone(useFolderLibrary.getState().bindings); writes = writes.catch(() => {}).then(() => set(key, value)); return writes; };
export function folderBinding(categoryId: string) {
  const category = useLibrary.getState().library.categories.find(c => c.id === categoryId);
  return useFolderLibrary.getState().bindings.find(b => b.id === (category?.parentId ?? categoryId));
}
export async function refreshFolder(id: string): Promise<void> {
  if (running.has(id)) { again.add(id); return running.get(id)!; }
  const work = (async () => {
    const binding = useFolderLibrary.getState().bindings.find(b => b.id === id); if (!binding) return;
    useFolderLibrary.setState({ busy: true });
    try {
      const snapshot = await invoke<Snapshot>('asset_folder_scan', { id, path: binding.path });
      const prior = useLibrary.getState().library;
      const files = snapshot.children.flatMap(c => c.files.map(file => ({ ...file, categoryId: c.id })));
      const other = prior.assets.filter(a => a.groupId !== id);
      if (other.length + files.length > 5000) throw new Error('素材库最多支持5000张，请减少文件夹中的图片');
      const assets: Asset[] = new Array(files.length), seen = { ...binding.seen }; let next = 0;
      const errors: string[] = [];
      await Promise.all(Array.from({ length: Math.min(2, files.length) }, async () => {
        while (next < files.length) {
          const index = next++, file = files[index], previous = prior.assets.find(a => a.id === file.id);
          if (previous && binding.seen[file.id] === file.revision) { assets[index] = previous; continue; }
          try {
            const bytes = await invoke<ArrayBuffer>('image_conversion_read', { path: file.path });
            const imported = await importImage(new File([bytes], file.name, { type: /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg' }));
            assets[index] = { ...imported, id: file.id, name: file.name.replace(/\.[^.]+$/, ''), categoryId: file.categoryId, groupId: id, source: 'user' };
            seen[file.id] = file.revision;
          } catch (error) { if (previous) assets[index] = previous; errors.push(`${file.name}：${String(error)}`); }
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }));
      if (!useFolderLibrary.getState().bindings.some(b => b.id === id)) return;
      const current = useLibrary.getState().library;
      const categories: Category[] = snapshot.children.map(c => ({ id: c.id, name: c.name, parentId: id, source: 'user', thumbnail: current.categories.find(old => old.id === c.id)?.thumbnail ?? '' }));
      useLibrary.setState({ library: { categories: [...current.categories.filter(c => c.parentId !== id), ...categories], assets: [...current.assets.filter(a => a.groupId !== id), ...assets.filter(Boolean)] } });
      const active = useLibrary.getState().activeCategory;
      if (current.categories.some(c => c.id === active && c.parentId === id) && !categories.some(c => c.id === active)) useLibrary.getState().select(id);
      useFolderLibrary.setState(s => ({ bindings: s.bindings.map(b => b.id === id ? { ...b, seen } : b), errors: { ...s.errors, [id]: errors.length ? `${errors.length}张图片未更新：${errors[0]}` : '' } }));
      await persist();
    } catch (error) { useFolderLibrary.setState(s => ({ errors: { ...s.errors, [id]: `文件夹不可用，现有素材已保留：${String(error)}` } })); }
    finally { running.delete(id); useFolderLibrary.setState({ busy: running.size > 0 }); if (again.delete(id)) queueMicrotask(() => void refreshFolder(id)); }
  })(); running.set(id, work); return work;
}
export function initializeFolderLibrary() {
  if (!isTauri()) return Promise.resolve();
  return initialized ??= (async () => {
    const saved: unknown = await get(key);
    const bindings: FolderBinding[] = Array.isArray(saved) ? saved.filter((b): b is FolderBinding => !!b && typeof b.id === 'string' && typeof b.path === 'string' && typeof b.name === 'string' && b.seen && typeof b.seen === 'object' && Object.values(b.seen).every(v => typeof v === 'string')) : [];
    useFolderLibrary.setState({ bindings });
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    await listen<string>('asset-folder-changed', event => { clearTimeout(timers.get(event.payload)); timers.set(event.payload, setTimeout(() => void refreshFolder(event.payload), 400)); });
    window.addEventListener('focus', () => { for (const b of useFolderLibrary.getState().bindings) void refreshFolder(b.id); });
    for (const binding of bindings) {
      if (!useLibrary.getState().library.categories.some(c => c.id === binding.id)) useLibrary.setState(s => ({ library: { ...s.library, categories: [...s.library.categories, { id: binding.id, name: binding.name, parentId: null, source: 'user', thumbnail: '' }] } }));
      await invoke('asset_folder_watch', { id: binding.id, path: binding.path }).catch(() => {});
      await refreshFolder(binding.id);
    }
  })().catch(error => { initialized = undefined; throw error; });
}
export async function createFolderGroup() {
  await initializeFolderLibrary();
  const selected = await open({ directory: true, multiple: false, title: '选择空文件夹，以文件夹名创建大分类' });
  if (typeof selected !== 'string') return false;
  const path = await invoke<string>('asset_folder_bind', { path: selected });
  if (useFolderLibrary.getState().bindings.some(b => b.path.toLowerCase() === path.toLowerCase())) throw new Error('该文件夹已经关联');
  const id = crypto.randomUUID(), name = path.split(/[\\/]/).at(-1)!;
  const binding: FolderBinding = { id, path, name, seen: {} };
  useFolderLibrary.setState(s => ({ bindings: [...s.bindings, binding] }));
  try { await persist(); } catch (error) { useFolderLibrary.setState(s => ({ bindings: s.bindings.filter(b => b.id !== id) })); throw error; }
  useLibrary.setState(s => ({ library: { ...s.library, categories: [...s.library.categories, { id, name, parentId: null, source: 'user', thumbnail: '' }] }, activeCategory: id }));
  await invoke('asset_folder_watch', { id, path }); return true;
}
export async function createFolderChild(id: string, name: string) {
  const binding = folderBinding(id); if (!binding) throw new Error('分类未关联文件夹');
  await invoke('asset_folder_create', { path: binding.path, name }); await refreshFolder(binding.id);
}
export async function uploadFolderImages(categoryId: string) {
  const binding = folderBinding(categoryId), category = useLibrary.getState().library.categories.find(c => c.id === categoryId);
  if (!binding || !category?.parentId) throw new Error('请先打开一个小分类');
  const files = await open({ multiple: true, filters: [{ name: '素材图片', extensions: ['png', 'jpg', 'jpeg'] }] }); if (!files) return;
  await invoke('asset_folder_import', { path: binding.path, category: category.name, files: typeof files === 'string' ? [files] : files });
  await refreshFolder(binding.id);
}
export async function removeFolderGroup(id: string, recycle: boolean) {
  const binding = folderBinding(id); if (!binding || binding.id !== id) return;
  if (recycle) await invoke('asset_folder_recycle', { path: binding.path });
  useFolderLibrary.setState(s => ({ bindings: s.bindings.filter(b => b.id !== id) })); await persist();
  await invoke('asset_folder_watch', { id, path: null }); useLibrary.getState().deleteCategory(id);
}
export const folderError = (error: unknown) => useUi.getState().notify(String(error), 'error');
