import { create } from 'zustand';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { get, set } from 'idb-keyval';
import { projectSchema } from './schema';
import { restoreProject } from './builtinReferences';
import { workspaceImages } from './workspaceImages';
import { emptyDocument } from '../layers/store';
import type { BuiltinLibrary } from '../assets/services/builtin';
import type { EditorDocument, Library } from '../shared/types';

export const useWorkspaceRecovery = create<{
  issues: string[]; protected: boolean; open: boolean; location: string;
}>(() => ({ issues: [], protected: false, open: false, location: '' }));
export const showWorkspaceRecovery = () => useWorkspaceRecovery.setState({ open: true });

export async function preserveWorkspace() {
  if (isTauri()) return invoke<string>('workspace_recovery_preserve');
  const raw = await get<string>('layerforge-workspace');
  if (raw !== undefined && raw !== null) {
    const key = 'layerforge-workspace-recovery-' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))), x => x.toString(16).padStart(2, '0')).join('');
    await set(key, raw);
    if (await get(key) !== raw) throw new Error('恢复副本核验失败');
    await set('layerforge-workspace-recovery-latest', key);
  }
  return '浏览器本地恢复副本';
}

export async function recoverWorkspace(raw: string, builtin: BuiltinLibrary) {
  const issues: string[] = [];
  const warn = (message: string) => { if (!issues.includes(message)) issues.push(message); };
  const value: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('工作区根结构无效');
  const source = value as Record<string, unknown>;
  if (source.version !== 1) throw new Error('工作区版本不受支持，已保留原始数据');
  const data = await workspaceImages(source, true, error => warn('资源恢复：' + String(error)));
  const record = data as Record<string, unknown>;
  const libraryInput = record.library as Partial<Library> | undefined;
  const categories: Library['categories'] = [], assets: Library['assets'] = [];
  for (const value of Array.isArray(libraryInput?.categories) ? libraryInput.categories : []) {
    const parsed = projectSchema.shape.library.shape.categories.element.safeParse(value);
    if (parsed.success && !categories.some(c => c.id === parsed.data.id)) categories.push(parsed.data);
    else warn('部分素材分类异常，原始条目保留在恢复副本中');
  }
  const validCategories = categories.filter(c => !c.parentId || categories.some(p => p.id === c.parentId && !p.parentId));
  if (validCategories.length !== categories.length) warn('部分素材分类父级异常，原始条目保留在恢复副本中');
  for (const value of Array.isArray(libraryInput?.assets) ? libraryInput.assets : []) {
    const parsed = projectSchema.shape.library.shape.assets.element.safeParse(value);
    if (parsed.success && !assets.some(a => a.id === parsed.data.id) && validCategories.some(c => c.id === parsed.data.categoryId && (c.parentId === parsed.data.groupId || (!c.parentId && c.id === parsed.data.groupId)))) assets.push(parsed.data);
    else warn('部分素材条目异常，原始条目保留在恢复副本中');
  }
  if (!libraryInput || !Array.isArray(libraryInput.categories) || !Array.isArray(libraryInput.assets)) warn('素材库结构异常，已保留原始记录');
  const library: Library = { categories: validCategories, assets };
  const resolve = (document: unknown) => {
    const parsed = projectSchema.parse({ version: 1, document, library });
    return restoreProject(parsed, builtin, reference => warn('素材暂不可用，已保留引用：' + reference));
  };
  const session = record.session as { activeId?: unknown; tasks?: unknown } | undefined;
  const entries: { id: string; document: EditorDocument; dirty: boolean }[] = [];
  const tasks = session && Array.isArray(session.tasks) ? session.tasks : session ? [] : [{ id: crypto.randomUUID(), document: record.document, dirty: true }];
  if (session && !Array.isArray(session.tasks)) warn('旧任务会话结构异常，已保留原始记录');
  for (const [index, task] of tasks.entries()) {
    try {
      if (!task || typeof task !== 'object') throw new Error('任务结构无效');
      const item = task as { id?: unknown; document?: unknown; dirty?: unknown };
      let id = typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 200 ? item.id : crypto.randomUUID();
      if (entries.some(t => t.id === id)) { id = crypto.randomUUID(); warn(`任务 ${index + 1} 的重复编号已修正，原编号保留在恢复副本中`); }
      const document = resolve(item.document).document;
      if (!session && document.canvasCreated === false) continue;
      entries.push({ id, document, dirty: typeof item.dirty === 'boolean' ? item.dirty : true });
    } catch (error) { warn(`任务 ${index + 1} 未能自动恢复，已隔离：${String(error).slice(0, 240)}`); }
  }
  // A bad session must not hide a healthy legacy active document.
  if (!entries.length && (tasks.length || (session && !Array.isArray(session.tasks)))) {
    try { const document = resolve(record.document).document; if (document.canvasCreated !== false) entries.push({ id: crypto.randomUUID(), document, dirty: true }); } catch { /* Original remains in the recovery archive. */ }
  }
  let activeId = entries.find(t => t.id === session?.activeId)?.id ?? entries[0]?.id ?? null;
  if (session && session.activeId !== activeId) warn('活动任务记录无效，已选择可恢复任务');
  const restoredLibrary = restoreProject({ version: 1, document: emptyDocument(), library }, builtin, reference => warn('素材暂不可用，已保留引用：' + reference)).library;
  if (isTauri()) {
    const hashes = [...new Set(raw.match(/library-image:\/\/[a-f0-9]{64}/g) ?? [])].map(ref => ref.slice('library-image://'.length));
    if (hashes.length) {
      const missing = await invoke<string[]>('workspace_recovery_missing_images', { hashes });
      if (missing.length) warn(`${missing.length} 份本地图片缺失，已保留图层与资源引用`);
    }
  }
  return { library: restoredLibrary, entries, activeId, issues };
}
