import { invoke } from '@tauri-apps/api/core';
import { modelWarning, parseModelBytes } from '../../model-viewer/resources/parse';
import { decodeTexture } from '../../model-viewer/resources/textures';
import { resourceCandidates } from '../../model-viewer/resources/resourceCandidates';
import { War3Engine } from '../../model-viewer/renderer/engine';
import { importCamera } from './camera';
import type { LoadedModel, Source } from '../../model-viewer/types';

/** Only this dialog owns the source ID, work queue, GL context and preview cache. */
export class ResourceSession {
  readonly id = `object-picker-${crypto.randomUUID()}`;
  source?: Source;
  private closed = false;
  private queue: Promise<unknown> = Promise.resolve();
  private previews = new Map<string, Promise<{ url: string; warning: string }>>();
  private models = new Map<string, Promise<LoadedModel>>();
  private textures = new Map<string, Promise<ImageData[]>>();
  private canvas?: HTMLCanvasElement;
  async open(path: string, full = false) {
    this.source = await invoke<Source>('viewer_open', { id: this.id, path, quick: !full });
    if (this.closed) { await invoke('viewer_close', { id: this.id }); throw new Error('已取消读取'); }
    return this.source;
  }
  check() { if (this.closed) throw new Error('素材来源已关闭'); }
  async read(path: string) { this.check(); const bytes = await invoke<ArrayBuffer>('viewer_read', { id: this.id, path }); this.check(); return bytes; }
  private cached<T>(cache: Map<string, Promise<T>>, path: string, limit: number, load: () => Promise<T>) {
    this.check();
    const key = path.replaceAll('\\', '/').toLowerCase(), found = cache.get(key);
    if (found) { cache.delete(key); cache.set(key, found); return found; }
    const work = load().then(value => { this.check(); return value; }); cache.set(key, work);
    void work.catch(() => { if (cache.get(key) === work) cache.delete(key); });
    while (cache.size > limit) cache.delete(cache.keys().next().value!);
    return work;
  }
  model(path: string): Promise<LoadedModel> {
    return this.cached(this.models, path, 3, () => this.loadModel(path));
  }
  private texture(path: string) {
    return this.cached(this.textures, path, 32, async () => decodeTexture(await this.read(path), path, 512));
  }
  private async loadModel(path: string): Promise<LoadedModel> {
    const bytes = await this.read(path), model = parseModelBytes(bytes, path);
    if (!model.Info || !model.Geosets || !model.Sequences || modelWarning(model)) throw new Error('模型结构不完整或存在损坏，不能导入此路径');
    const loaded: LoadedModel = { ref: { sourceId: this.id, path }, bytes, model, dependencies: [], images: new Map() };
    for (const name of new Set(model.Textures.map(texture => texture.Image).filter(Boolean))) {
      let found = false;
      for (const candidate of resourceCandidates(name, path)) {
        try { const images = await this.texture(candidate); this.check(); loaded.images.set(name, images); found = true; break; }
        catch { this.check(); }
      }
      loaded.dependencies.push({ path: name, ...(found ? {} : { error: '当前地图内未找到或无法解码贴图' }) });
    }
    return loaded;
  }
  preview(path: string, model: boolean, wanted = () => true): Promise<{ url: string; warning: string }> {
    const cached = this.previews.get(path); if (cached) return cached.catch(error => {
      if (error instanceof Error && error.message === '预览已取消' && wanted()) return this.preview(path, model, wanted);
      throw error;
    });
    const work = this.queue.catch(() => {}).then(async () => {
      this.check();
      if (!wanted()) { this.previews.delete(path); throw new Error('预览已取消'); }
      if (!model) {
        const [image] = await decodeTexture(await this.read(path), path, 160); this.check();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        canvas.getContext('2d')!.putImageData(image, 0, 0); return { url: canvas.toDataURL(), warning: '' };
      }
      // Yield between thumbnails so pointer events and the active animation keep responding.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      const loaded = await this.model(path); this.check();
      if (!wanted()) { this.previews.delete(path); throw new Error('预览已取消'); }
      const canvas = this.canvas ??= document.createElement('canvas'); canvas.width = 160; canvas.height = 160;
      const engine = new War3Engine(canvas, loaded);
      try { engine.sequence(0); engine.update(100, true); engine.draw(importCamera(engine, 1), '#20252b', '#ed3434');
        return { url: canvas.toDataURL(), warning: loaded.dependencies.some(d => d.error) ? '缺少贴图，预览使用默认材质' : '' };
      } finally { engine.destroy(); }
    });
    this.queue = work; this.previews.set(path, work);
    // Bounded thumbnails plus three hot models and shared decoded textures.
    while (this.previews.size > 128) this.previews.delete(this.previews.keys().next().value!);
    return work;
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.previews.clear(); this.models.clear(); this.textures.clear();
    void invoke('viewer_cancel', { id: this.id }).catch(() => {});
    this.canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext(); this.canvas = undefined;
    void invoke('viewer_close', { id: this.id }).catch(() => {});
  }
}
