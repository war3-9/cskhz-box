import { isMusic, isTexture, resourceKey, type ResourceRef } from '../types';
import { sortModelEntries, type Viewer } from '../workspace/store';
export type ExportScope = 'current' | 'selected' | 'all';
export function exportRefs(state: Viewer, scope: ExportScope): ResourceRef[] {
  if (scope === 'current') return state.current ? [state.current] : [];
  const source = state.sources.find(s => s.id === state.activeSource);
  if (!source) return [];
  const entries = source.entries.filter(e => state.kind === 'music' ? isMusic(e.path) : state.kind === 'terrain' ? !!e.terrain : state.kind === 'model' ? e.model : isTexture(e.path));
  return sortModelEntries(entries.filter(e => scope !== 'selected' || state.selected.includes(resourceKey(source, e.path))), state.sort)
    .map(e => ({ sourceId: source.id, path: e.path }));
}
