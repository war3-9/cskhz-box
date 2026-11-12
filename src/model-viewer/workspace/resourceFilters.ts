import { isMusic, isTexture, normalizePath, type Entry, type Source } from '../types';
const caches = new WeakMap<Source, { skins: Set<string>; unused: Set<string>; variants: Map<string, Entry[]> }>();
function index(source: Source) {
  let cached = caches.get(source);
  if (!cached) { cached = { skins: new Set(source.analysis?.modelTextures.map(normalizePath)), unused: new Set(source.analysis?.unusedModels.map(normalizePath)), variants: new Map() }; caches.set(source, cached); }
  return cached;
}
export function isUnusedModel(source: Source, path: string) { return !!source.analysis?.usageSupported && index(source).unused.has(normalizePath(path)); }
export function resourceEntries(source: Source | undefined, kind: 'model' | 'texture' | 'terrain' | 'music', hideModelTextures = true, usage = 'all') {
  if (!source) return [];
  const cache = index(source), key = `${kind}:${hideModelTextures}:${usage}`;
  let entries = cache.variants.get(key);
  if (!entries) {
    entries = source.entries.filter(entry => kind === 'music' ? isMusic(entry.path) : kind === 'terrain' ? !!entry.terrain : kind === 'model' ? entry.model && (usage !== 'unused' || isUnusedModel(source, entry.path)) : isTexture(entry.path) && (!hideModelTextures || !cache.skins.has(normalizePath(entry.path))));
    cache.variants.set(key, entries);
  }
  return entries;
}
