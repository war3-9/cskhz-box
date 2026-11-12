import { parseModelBytes } from './parse';
import { modelGroup } from './group';
self.onmessage = ({ data }: MessageEvent<{ id: number; bytes: ArrayBuffer; path: string }>) => {
  try {
    const model = parseModelBytes(data.bytes, data.path);
    self.postMessage({ id: data.id, group: modelGroup(model, data.path), textures: model.Textures.map(texture => texture.Image).filter(Boolean) });
  } catch { self.postMessage({ id: data.id, group: 2, textures: [] }); }
};
