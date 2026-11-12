import { readResource } from '../resources/providers';
import { decodeTexture } from '../resources/textures';
import type { ResourceRef } from '../types';
import { useViewer } from '../workspace/store';
const cache = new Map<string, Promise<string>>();
export function thumbnail(ref: ResourceRef) {
  const key = `${useViewer.getState().revision}:${ref.sourceId}:${ref.path}`;
  if (!cache.has(key)) {
    const promise = (async () => {
      const [data] = await decodeTexture(await readResource(ref), ref.path);
      const image = document.createElement('canvas'); image.width = data.width; image.height = data.height; image.getContext('2d')!.putImageData(data, 0, 0); return image.toDataURL();
    })().catch(error => { cache.delete(key); throw error; });
    cache.set(key, promise);
    if (cache.size > 256) cache.delete(cache.keys().next().value!);
  }
  return cache.get(key)!;
}
