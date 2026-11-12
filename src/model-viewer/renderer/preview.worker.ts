import { parseModelBytes } from '../resources/parse';
import { appearanceNote } from '../resources/appearance';
import { decodeTexture } from '../resources/textures';
import type { LoadedModel, ResourceRef } from '../types';
import { War3Engine, sequenceFor } from './engine';
import { cardCamera } from './cardCamera';
import { PreviewCache } from './previewCache';
import type { PreviewItem, PreviewMessage, PreviewReply, PreviewSettings } from './previewProtocol';

const scope = self as unknown as { postMessage: (message: PreviewReply) => void; onmessage: ((event: MessageEvent<PreviewMessage>) => void) | null };
interface Target { framebuffer: WebGLFramebuffer; texture: WebGLTexture; depth: WebGLRenderbuffer; size: number; stamp: string }
interface Live { engine: War3Engine; camera: ReturnType<typeof cardCamera>; last: number; done: boolean; action: string; loop: boolean }
let canvas: OffscreenCanvas, gl: WebGL2RenderingContext, items: PreviewItem[] = [], scale = 1, active = true;
let settings: PreviewSettings = { action: 'stand', background: '#000000', team: '#ed3434', speed: 1, loop: true };
let generation = 0, requestId = 0, inFlight = 0, cursor = 0, dirty = true;
const requests = new Map<number, { resolve: (value: { bytes: ArrayBuffer; identity: string }) => void; reject: (error: Error) => void }>();
const loading = new Set<string>(), failures = new Set<string>(), prepared = new Map<string, LoadedModel>();
const notes = new Map<string, string>();
const errors = new Map<string, string>();
const textures = new Map<string, Promise<ImageData[]>>();
const targets = new PreviewCache<Target>(1536, 192 * 1024 * 1024, target => {
  gl.deleteFramebuffer(target.framebuffer); gl.deleteRenderbuffer(target.depth); gl.deleteTexture(target.texture);
});
const engines = new PreviewCache<Live>(128, 256 * 1024 * 1024, value => value.engine.destroy());

function read(ref: ResourceRef, texture?: string) {
  return new Promise<{ bytes: ArrayBuffer; identity: string }>((resolve, reject) => {
    const request = ++requestId; requests.set(request, { resolve, reject }); scope.postMessage({ type: 'read', request, ref, texture });
  });
}
async function load(item: PreviewItem) {
  const current = generation; loading.add(item.key); inFlight++;
  try {
    const { bytes } = await read(item.ref);
    if (current !== generation) return;
    const model = parseModelBytes(bytes, item.ref.path);
    const note = appearanceNote(model);
    if (note) { failures.add(item.key); notes.set(item.key, note); scope.postMessage({ type: 'note', key: item.key, note }); return; }
    const loaded: LoadedModel = { ref: item.ref, bytes, model, dependencies: [], images: new Map() };
    await Promise.all(model.Textures.filter(texture => texture.Image).map(async texture => {
      try {
        const result = await read(item.ref, texture.Image);
        if (current !== generation) return;
        // Resolved identity includes the source and actual path: neighbouring
        // models share a decode, while identical basenames in other folders do not.
        let promise = textures.get(result.identity);
        if (!promise) {
          promise = decodeTexture(result.bytes, texture.Image, 256); textures.set(result.identity, promise);
          void promise.catch(() => { if (textures.get(result.identity) === promise) textures.delete(result.identity); });
          // Engines retain the images they need; bound the decode lookup as well.
          while (textures.size > 128) textures.delete(textures.keys().next().value!);
        }
        loaded.images.set(texture.Image, await promise);
      } catch { /* Missing skins retain the existing renderer fallback. */ }
    }));
    if (current === generation && items.some(visible => visible.key === item.key)) prepared.set(item.key, loaded);
  } catch (error) {
    if (current === generation) { failures.add(item.key); errors.set(item.key, String(error)); scope.postMessage({ type: 'error', key: item.key, error: String(error) }); }
  } finally { if (current === generation) { inFlight--; loading.delete(item.key); } }
}
function targetFor(key: string, size: number) {
  let target = targets.get(key);
  if (target?.size === size) return target;
  const framebuffer = gl.createFramebuffer(), texture = gl.createTexture(), depth = gl.createRenderbuffer();
  if (!framebuffer || !texture || !depth) throw new Error('无法分配预览缓存');
  target = { framebuffer, texture, depth, size, stamp: '' };
  gl.bindTexture(gl.TEXTURE_2D, texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer); gl.deleteTexture(texture); gl.deleteRenderbuffer(depth); throw new Error('预览缓存帧缓冲不可用');
  }
  targets.set(key, target, size * size * 6); return target;
}
function stamp() { return `${settings.action}|${settings.background}|${settings.team}|${settings.loop}`; }
function render(item: PreviewItem, now: number) {
  let live = engines.get(item.key);
  const loaded = prepared.get(item.key);
  if (!live && loaded) {
    prepared.delete(item.key);
    const engine = new War3Engine(canvas, loaded);
    live = { engine, camera: cardCamera(engine, 1), last: now, done: false, action: settings.action, loop: settings.loop };
    engine.sequence(sequenceFor(engine.data, settings.action));
    for (let i = 0; i < 6; i++) engine.update(40, settings.loop);
    const bytes = loaded.bytes.byteLength * 3 + [...loaded.images.values()].flat().reduce((n, image) => n + image.data.byteLength * 2, 0);
    engines.set(item.key, live, bytes);
  }
  if (!live) return;
  const size = Math.min(320, Math.max(96, Math.ceil(item.width / 8) * 8));
  const cached = targets.get(item.key), changed = cached?.stamp !== stamp() || cached.size !== size;
  if (!changed && (live.done || now - live.last < 33)) return;
  if (live.action !== settings.action || live.loop !== settings.loop) {
    live.action = settings.action; live.loop = settings.loop; live.done = false; live.engine.sequence(sequenceFor(live.engine.data, settings.action));
  }
  const target = targetFor(item.key, size);
  // A hidden card resumes from its cached frame; it does not fast-forward minutes.
  live.done = live.engine.update(Math.min(100, now - live.last) * settings.speed, settings.loop); live.last = now;
  gl.disable(gl.SCISSOR_TEST); live.engine.draw(live.camera, settings.background, settings.team, false, target);
  const firstFrame = !target.stamp;
  target.stamp = stamp(); dirty = true; if (firstFrame) scope.postMessage({ type: 'ready', key: item.key });
}
function compose() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.SCISSOR_TEST); gl.colorMask(true, true, true, true);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  for (const item of items) {
    const target = targets.get(item.key); if (!target || !target.stamp) continue;
    const x = Math.round(item.x * scale), y = canvas.height - Math.round((item.y + item.height) * scale);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, target.size, target.size, x, y, x + Math.round(item.width * scale), y + Math.round(item.height * scale), gl.COLOR_BUFFER_BIT, gl.LINEAR);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); dirty = false;
}
function tick() {
  if (gl && active && !gl.isContextLost()) {
    // Present cached images before spending time on new GPU uploads/animation.
    if (dirty) compose();
    const start = performance.now(), protectedKeys = new Set(items.map(item => item.key));
    for (let i = 0; i < items.length; i++) {
      const item = items[cursor++ % items.length];
      if (failures.has(item.key)) continue;
      try {
        if (!engines.get(item.key) && !prepared.has(item.key) && !loading.has(item.key) && !failures.has(item.key) && inFlight < 4) void load(item);
        render(item, performance.now());
      } catch (error) { failures.add(item.key); errors.set(item.key, String(error)); scope.postMessage({ type: 'error', key: item.key, error: String(error) }); }
      if (performance.now() - start >= 3) break;
    }
    if (dirty) compose();
    engines.trim(protectedKeys); targets.trim(protectedKeys);
    for (const key of prepared.keys()) if (!protectedKeys.has(key)) prepared.delete(key);
  }
  setTimeout(tick, active ? 16 : 150);
}
scope.onmessage = ({ data }) => {
  if (data.type === 'init') {
    canvas = data.canvas;
    const context = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!context) { scope.postMessage({ type: 'error', error: '无法建立列表 WebGL2 上下文' }); return; }
    gl = context; canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); scope.postMessage({ type: 'error', error: '列表 GPU 上下文丢失，请刷新模型显示' }); });
    tick();
  } else if (data.type === 'layout') {
    items = data.items;
    const max = gl ? Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS)) : 2048;
    scale = Math.min(data.scale, max / Math.max(1, data.width, data.height));
    if (canvas) { const width = Math.max(1, Math.round(data.width * scale)), height = Math.max(1, Math.round(data.height * scale)); if (canvas.width !== width) canvas.width = width; if (canvas.height !== height) canvas.height = height; }
    dirty = true;
    for (const item of items) if (targets.get(item.key)?.stamp) scope.postMessage({ type: 'ready', key: item.key });
    for (const item of items) if (notes.has(item.key)) scope.postMessage({ type: 'note', key: item.key, note: notes.get(item.key)! });
    // React may recreate a visible card while its failed resource stays cached.
    // Replay its error to the new slot just as we replay ready frames and notes.
    for (const item of items) if (errors.has(item.key)) scope.postMessage({ type: 'error', key: item.key, error: errors.get(item.key)! });
  } else if (data.type === 'settings') { settings = data.settings; active = data.active; dirty = true; }
  else if (data.type === 'clear') {
    generation++; inFlight = 0;
    for (const request of requests.values()) request.reject(new Error('模型来源已刷新'));
    requests.clear(); engines.clear(); targets.clear(); prepared.clear(); textures.clear(); failures.clear(); notes.clear(); errors.clear(); loading.clear(); dirty = true;
  }
  else if (data.type === 'resource') {
    const request = requests.get(data.request); requests.delete(data.request);
    if (request) { if (data.bytes) request.resolve({ bytes: data.bytes, identity: data.identity! }); else request.reject(new Error(data.error)); }
  }
};
