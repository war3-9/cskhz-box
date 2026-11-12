import { resourceKey, type ResourceRef } from '../types';
import { useViewer, visibleModels } from './store';

let anchor: { ref: ResourceRef; base: string[] } | undefined;
let lastSelection: string[] | undefined;
export function selectResource(ref: ResourceRef, modifiers: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}) {
  const state = useViewer.getState(), source = state.sources.find(source => source.id === ref.sourceId);
  if (!source) return;
  if (state.selected !== lastSelection || anchor?.ref.sourceId !== ref.sourceId) anchor = undefined;
  const key = resourceKey(source, ref.path), entries = visibleModels(state);
  let selected: string[];
  if (modifiers.shiftKey && state.current?.sourceId === ref.sourceId) {
    anchor ??= { ref: state.current, base: [] };
    const start = entries.findIndex(entry => entry.path === anchor!.ref.path), end = entries.findIndex(entry => entry.path === ref.path);
    const range = start >= 0 && end >= 0 ? entries.slice(Math.min(start, end), Math.max(start, end) + 1).map(entry => resourceKey(source, entry.path)) : [key];
    selected = [...new Set([...(modifiers.ctrlKey || modifiers.metaKey ? state.selected : anchor.base), ...range])];
  } else if (modifiers.ctrlKey || modifiers.metaKey) selected = state.selected.includes(key) ? state.selected.filter(value => value !== key) : [...state.selected, key];
  else selected = [key];
  if (!modifiers.shiftKey) anchor = { ref, base: modifiers.ctrlKey || modifiers.metaKey ? selected.filter(value => value !== key) : [] };
  state.patch({ selected }); state.focus(ref);
  lastSelection = useViewer.getState().selected;
}
