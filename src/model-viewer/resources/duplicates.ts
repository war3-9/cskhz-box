import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { normalizePath, resourceKey, type Source } from '../types';
import { useViewer } from '../workspace/store';
import type { MutationResult } from './mutations';

export type DuplicateKind = 'models' | 'textures';
export interface DuplicateProgress { stage: 'waiting' | 'indexing' | 'reading' | 'hashing' | 'fingerprint' | 'references' | 'models' | 'textures' | 'external'; completed: number; total: number }
export interface DuplicateGroup {
  key: string; paths: string[]; bytes: number; reclaimBytes: number;
  references: { texture: string; models: string[] }[]; blockedReason?: string | null;
}
export interface DuplicateScan {
  fingerprint: string; models: DuplicateGroup[]; textures: DuplicateGroup[]; warnings: string[]; canMerge: boolean;
}
export interface DuplicateChoice { keep: string; remove: string[] }
export function duplicateChoices(groups: DuplicateGroup[], checked: string[], keep: Record<string, string>): DuplicateChoice[] {
  return groups.filter(group => checked.includes(group.key) && !group.blockedReason).map(group => {
    const retained = group.paths.includes(keep[group.key]) ? keep[group.key] : group.paths[0];
    return { keep: retained, remove: group.paths.filter(path => path !== retained) };
  });
}
export async function findDuplicates(source: Source, kind?: DuplicateKind, update?: (progress: DuplicateProgress) => void) {
  if (!isTauri()) throw new Error('查重和合并请在桌面版使用');
  const progress = update ? new Channel<DuplicateProgress>() : undefined;
  if (progress && update) progress.onmessage = update;
  return invoke<DuplicateScan>('viewer_find_duplicates', { id: source.id, kind, progress });
}

export async function cancelDuplicateScan(sourceId: string) {
  if (isTauri()) await invoke('viewer_cancel', { id: sourceId });
}
export async function applyDuplicates(source: Source, scan: DuplicateScan, kind: DuplicateKind, groups: DuplicateChoice[]) {
  const result = await invoke<MutationResult>(kind === 'models' ? 'viewer_delete_duplicate_models' : 'viewer_merge_duplicate_textures', {
    id: source.id, fingerprint: scan.fingerprint, groups,
  });
  const state = useViewer.getState(), prefix = `${normalizePath(source.path)}|`;
  const existing = new Set(result.source.entries.map(entry => resourceKey(result.source, entry.path)));
  const exists = (key: string) => !key.startsWith(prefix) || existing.has(key);
  state.add(result.source, true);
  const currentGone = state.current?.sourceId === source.id && !existing.has(resourceKey(result.source, state.current.path));
  state.patch({ selected: state.selected.filter(exists), favorites: state.favorites.filter(exists),
    categories: Object.fromEntries(Object.entries(state.categories).filter(([key]) => exists(key))),
    exportNames: Object.fromEntries(Object.entries(state.exportNames).filter(([key]) => exists(key))),
    ...(currentGone ? { current: undefined, detail: false } : {}),
    status: `${kind === 'models' ? '重复模型删除' : '重复贴图合并'}完成：${result.changed} 个文件${result.backup ? ` · 备份：${result.backup}` : ''}` });
  return result;
}
