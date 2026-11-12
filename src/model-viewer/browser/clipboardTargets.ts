import { resourceKey, type Source } from '../types';

let hovered: { sourceId: string; path: string } | undefined;
export function hoverClipboardModel(sourceId?: string, path?: string) { hovered = sourceId && path ? { sourceId, path } : undefined; }
export function hoveredClipboardModel(sourceId: string) { return hovered?.sourceId === sourceId ? hovered.path : undefined; }

export function clipboardModelPaths(source: Source, selected: string[], fallback?: string) {
  const paths = source.entries.filter(entry => entry.model && selected.includes(resourceKey(source, entry.path))).map(entry => entry.path);
  return paths.length ? paths : source.entries.some(entry => entry.model && entry.path === fallback) ? [fallback!] : [];
}
