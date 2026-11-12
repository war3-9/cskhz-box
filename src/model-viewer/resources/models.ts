import { parseModelBytes, modelWarning } from './parse';
import { readResource } from './providers';
import { loadTexture } from './textureCache';
import { keyOf, type LoadedModel, type ResourceRef } from '../types';
import { useViewer } from '../workspace/store';
const cache = new Map<string, Promise<LoadedModel>>();
const sizes = new Map<string, number>();
function clearModelCache() { cache.clear(); sizes.clear(); }
useViewer.subscribe((state, previous) => { if (state.revision !== previous.revision) clearModelCache(); });
async function load(ref: ResourceRef, withTextures: boolean, maxSize: number): Promise<LoadedModel> {
  const startRevision = useViewer.getState().revision;
  const basic = withTextures ? await loadModel(ref, false) : undefined;
  const bytes = basic?.bytes || await readResource(ref);
  const model = basic?.model || parseModelBytes(bytes, ref.path);
  if (!model.Info || !model.Geosets || !model.Sequences) throw new Error('模型结构不完整');
  const loaded: LoadedModel = { ref, bytes, model, dependencies: [], images: new Map(), warning: modelWarning(model) };
  if (!withTextures) return loaded;
  const dependencies = await Promise.all(model.Textures.map(async texture => {
    if (!texture.Image) return { path: '', replaceableId: texture.ReplaceableId };
    const dependency = { path: texture.Image } as LoadedModel['dependencies'][number];
    try { const resolved = await loadTexture(ref.sourceId, texture.Image, maxSize, ref.path); dependency.source = resolved.source; dependency.ref = resolved.ref; dependency.size = resolved.bytes.byteLength; loaded.images.set(texture.Image, resolved.images); }
    catch (error) { dependency.error = String(error); }
    return dependency;
  }));
  loaded.dependencies = dependencies;
  if (useViewer.getState().revision !== startRevision || !useViewer.getState().sources.some(s => s.id === ref.sourceId)) throw new Error('加载期间来源已关闭或替换');
  return loaded;
}
export function loadModel(ref: ResourceRef, withTextures = true, maxSize = Infinity): Promise<LoadedModel> {
  const key = `${useViewer.getState().revision}:${keyOf(ref)}:${withTextures}:${maxSize}`;
  if (!cache.has(key)) {
    const promise = load(ref, withTextures, maxSize).catch(error => { cache.delete(key); sizes.delete(key); throw error; }); cache.set(key, promise);
    void promise.then(loaded => {
      if (cache.get(key) !== promise) return;
      sizes.set(key, loaded.bytes.byteLength * 2 + [...loaded.images.values()].flat().reduce((total, image) => total + image.data.byteLength, 0));
      let total = [...sizes.values()].reduce((a, b) => a + b, 0);
      for (const oldKey of cache.keys()) { if (cache.size <= 2048 && total <= 192 * 1024 * 1024) break; const size = sizes.get(oldKey); if (size === undefined) continue; cache.delete(oldKey); sizes.delete(oldKey); total -= size; }
    }, () => {});
  }
  const promise = cache.get(key)!; cache.delete(key); cache.set(key, promise); return promise;
}
