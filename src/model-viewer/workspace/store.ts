import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { viewerStorage } from '../persistence/storage';
import { validateSavedViewer } from '../persistence/schema';
import { isMusic, normalizePath, resourceKey, type Entry, type Source, type ResourceRef } from '../types';
import { migrateAnonymousKeys, migrateRecoveredNames } from './anonymousNames';
import type { ExhibitLimit } from '../exhibit/scope';
import { resourceEntries } from './resourceFilters';
import { categoryActions, type CategoryActions } from './categories';

export interface Settings { team: string; background: string; speed: number; loop: boolean; spacing: number; pageSize: number; action: string; sideWidth: number; rows: number; height: number; cardSize: 'small' | 'medium' | 'large'; ground?: string; hideModelTextures?: boolean }
export interface Camera { yaw: number; pitch: number; distance: number; panX: number; panY: number }
export const defaultCamera: Camera = { yaw: 0, pitch: .16, distance: 2.7, panX: 0, panY: 0 };
interface Data {
  sources: Source[]; activeSource: string; selected: string[]; current?: ResourceRef;
  query: string; directory: string; page: number; sort: string; mode: 'grid' | 'list' | 'exhibit'; kind: 'model' | 'texture' | 'terrain' | 'music'; detail: boolean; modelUsage: 'all' | 'unused';
  favorites: string[]; categories: Record<string, string>; categoryNames: string[]; category: string; recent: string[]; sessionPaths: string[];
  settings: Settings; playing: boolean; sequence: number; frame: number; seek: number; camera: Camera; scroll: number; sideScroll: number;
  status: string; error: string; busy?: string; fileBusy: boolean; revision: number; exportDirectory: string; captureDirectory: string;
  captureFrame: { x: number; y: number; width: number; height: number };
  exhibitLimit: ExhibitLimit;
  sourceRoles: Record<string, 'primary' | 'supplement' | 'game'>; exportNames: Record<string, string>;
}
export interface Viewer extends Data, CategoryActions {
  patch: (value: Partial<Data>) => void; configure: (value: Partial<Settings>) => void;
  add: (source: Source, restore?: boolean) => void; remove: (id: string) => void;
  toggle: (key: string) => void; favorite: (key: string) => void;
  focus: (ref: ResourceRef, detail?: boolean) => void;
}
export const useViewer = create<Viewer>()(persist((set) => ({
  sources: [], activeSource: '', selected: [], query: '', directory: '', page: 0, sort: 'group', mode: 'grid', kind: 'model', detail: false, modelUsage: 'all',
  favorites: [], categories: {}, categoryNames: [], category: '', recent: [], sessionPaths: [], sourceRoles: {}, exportNames: {},
  captureDirectory: '', captureFrame: { x: .15, y: .05, width: .7, height: .9 },
  settings: { team: '#ed3434', background: '#000000', speed: 1, loop: true, spacing: 200, pageSize: 100, action: 'stand', sideWidth: 340, rows: 6, height: 0, cardSize: 'medium', ground: 'checker' },
  playing: true, sequence: 0, frame: 0, seek: 0, camera: { ...defaultCamera }, scroll: 0, sideScroll: 0, status: '', error: '', revision: 0, exportDirectory: '', fileBusy: false, exhibitLimit: 'page',
  patch: value => set(value), configure: value => set(s => ({ settings: { ...s.settings, ...value } })),
  add: (source, restore = false) => set(s => ({ sources: [...s.sources.filter(x => x.path !== source.path), source],
    ...migrateRecoveredNames(source, s),
    ...(!restore ? { activeSource: source.id, modelUsage: 'all' as const, directory: '', query: '', category: '', kind: 'model' as const, mode: 'grid' as const, sort: 'group', page: 0, current: undefined, detail: false, scroll: 0, sideScroll: 0 } : {}),
    revision: s.revision + 1, status: `已读取 ${source.entries.filter(e => e.model).length} 个模型${source.entries.some(e => isMusic(e.path)) ? `、${source.entries.filter(e => isMusic(e.path)).length} 个音乐` : ''}`,
    recent: [source.path, ...s.recent.filter(p => p !== source.path)].slice(0, 12), sessionPaths: [...new Set([...s.sessionPaths, source.path])] })),
  remove: id => set(s => { const source = s.sources.find(x => x.id === id); const sources = s.sources.filter(x => x.id !== id);
    const activeSource = s.activeSource === id ? sources[0]?.id || '' : s.activeSource;
    const fallback = sources.find(item => item.id === activeSource);
    return { sources, modelUsage: 'all' as const, revision: s.revision + 1, activeSource,
      selected: s.selected.filter(key => !source || !key.startsWith(`${normalizePath(source.path)}|`)),
      current: s.current?.sourceId === id ? undefined : s.current, detail: s.current?.sourceId === id ? false : s.detail,
      ...(s.directory && !fallback?.entries.some(e => normalizePath(e.path).startsWith(`${normalizePath(s.directory)}/`)) ? { directory: '' } : {}),
      sessionPaths: s.sessionPaths.filter(p => p !== source?.path), page: 0 }; }),
  toggle: key => set(s => ({ selected: s.selected.includes(key) ? s.selected.filter(k => k !== key) : [...s.selected, key] })),
  favorite: key => set(s => ({ favorites: s.favorites.includes(key) ? s.favorites.filter(k => k !== key) : [...s.favorites, key] })),
  ...categoryActions<Viewer>(set),
  focus: (ref, detail = false) => set(s => ({ current: ref, detail, ...(s.current?.sourceId !== ref.sourceId || s.current?.path !== ref.path ? { sequence: 0, frame: 0, seek: s.seek + 1, camera: { ...defaultCamera } } : {}) })),
}), { name: 'box-model-viewer-v2', version: 2, storage: createJSONStorage(() => viewerStorage), skipHydration: true, merge: (saved, current) => {
  const valid = validateSavedViewer(saved);
  const preferences = Object.fromEntries(['favorites', 'categories', 'categoryNames', 'recent', 'sourceRoles', 'exportNames', 'exportDirectory', 'captureDirectory', 'captureFrame'].filter(key => key in valid).map(key => [key, valid[key as keyof typeof valid]]));
  return { ...current, ...preferences, ...migrateAnonymousKeys(preferences), settings: { ...current.settings, ...valid.settings } };
}, partialize: s => ({ settings: s.settings, favorites: s.favorites, categories: s.categories, categoryNames: s.categoryNames, recent: s.recent, sourceRoles: s.sourceRoles, exportNames: s.exportNames, exportDirectory: s.exportDirectory, captureDirectory: s.captureDirectory, captureFrame: s.captureFrame }) }));

let visibleInputs: unknown[] = [], visibleEntries: Entry[] = [];
export function visibleModels(state: Viewer) {
  const source = state.sources.find(s => s.id === state.activeSource);
  if (!source) return [];
  const inputs = [source, state.directory, state.query, state.kind, state.category, state.favorites, state.categories, state.sort, state.settings.hideModelTextures, state.modelUsage];
  if (inputs.every((value, index) => value === visibleInputs[index])) return visibleEntries;
  const directory = normalizePath(state.directory), query = state.query.toLowerCase();
  const entries = resourceEntries(source, state.kind, state.settings.hideModelTextures, state.modelUsage).filter(e => normalizePath(e.path).includes(query) && (!directory || normalizePath(e.path).startsWith(`${directory}/`)))
    .filter(e => !state.category || (state.category === '*' ? state.favorites.includes(resourceKey(source, e.path)) : state.category === '?' ? !state.categories[resourceKey(source, e.path)] : state.categories[resourceKey(source, e.path)] === state.category));
  visibleInputs = inputs; visibleEntries = sortModelEntries(entries, state.sort);
  return visibleEntries;
}
const nameCollator = new Intl.Collator('zh-CN', { numeric: true });
export function sortModelEntries(entries: Entry[], sort: string) {
  const direction = sort.endsWith('-desc') ? -1 : 1;
  return entries.sort((a, b) => sort === 'group' && (a.modelGroup ?? 2) !== (b.modelGroup ?? 2) ? (a.modelGroup ?? 2) - (b.modelGroup ?? 2) : (sort.startsWith('size') ? a.size - b.size : sort.startsWith('type') ? (a.path.split('.').pop() || '').localeCompare(b.path.split('.').pop() || '') : nameCollator.compare(a.path, b.path)) * direction);
}
