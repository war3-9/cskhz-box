import { resolveResource } from './providers';
import { decodeTexture } from './textures';
import { useViewer } from '../workspace/store';
import { normalizePath } from '../types';
const cache = new Map<string, { promise: ReturnType<typeof load>; size: number }>();
useViewer.subscribe((state, previous) => { if (state.revision !== previous.revision) cache.clear(); });
async function load(sourceId: string, path: string, maxSize: number, modelPath?: string) {
  const resolved = await resolveResource(sourceId, path, modelPath);
  return { ...resolved, images: await decodeTexture(resolved.bytes, path, maxSize) };
}
export function loadTexture(sourceId: string, path: string, maxSize = Infinity, modelPath?: string) {
  const key = `${useViewer.getState().revision}:${sourceId}:${normalizePath(path)}:${normalizePath(modelPath || '')}:${maxSize}`;
  let entry = cache.get(key);
  if (entry) { cache.delete(key); cache.set(key, entry); return entry.promise; }
  entry = { size: 0, promise: load(sourceId, path, maxSize, modelPath) }; cache.set(key, entry);
  const current = entry;
  void entry.promise.then(value => {
    current.size = value.images.reduce((size, image) => size + image.data.byteLength, 0);
    let total = [...cache.values()].reduce((size, item) => size + item.size, 0);
    for (const [oldKey, old] of cache) { if (cache.size <= 256 && total <= 128 * 1024 * 1024) break; if (!old.size) continue; cache.delete(oldKey); total -= old.size; }
  }, () => { if (cache.get(key) === current) cache.delete(key); });
  return entry.promise;
}
