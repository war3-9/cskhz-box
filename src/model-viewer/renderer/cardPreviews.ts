import { readResource, resolveResource } from '../resources/providers';
import { keyOf, normalizePath, type ResourceRef } from '../types';
import { useViewer } from '../workspace/store';
import type { PreviewItem, PreviewMessage, PreviewReply } from './previewProtocol';

interface Slot { element: HTMLElement; ref: ResourceRef; ready: () => void; fail: (error: string, informational?: boolean) => void }
const slots = new Set<Slot>();
let worker: Worker | undefined, host: HTMLElement | undefined, scrollHost: HTMLElement | undefined, frame = 0, active = true;
let broken = false, restartSurface: (() => void) | undefined;
let surfaceError: string | undefined;
function send(message: PreviewMessage, transfer: Transferable[] = []) { worker?.postMessage(message, transfer); }
function settings() {
  const { action, background, team, loop, speed } = useViewer.getState().settings;
  send({ type: 'settings', settings: { action, background, team, loop, speed }, active: active && !document.hidden });
}
function layout() {
  frame = 0; if (!host || !worker) return;
  const rect = host.getBoundingClientRect(), viewport = scrollHost?.getBoundingClientRect() ?? rect, items: PreviewItem[] = [];
  for (const slot of slots) {
    const card = slot.element.getBoundingClientRect();
    if (card.width && card.height && card.right > viewport.left && card.left < viewport.right && card.bottom > viewport.top && card.top < viewport.bottom) {
      items.push({ key: keyOf(slot.ref), ref: slot.ref, x: card.left - rect.left, y: card.top - rect.top, width: card.width, height: card.height });
    }
  }
  // The canvas belongs to the scroll content, so native scrolling moves the
  // cached GPU image and card borders atomically, even while the worker is busy.
  // Bound its backing store for long pages and very large desktop windows.
  const scale = Math.min(1.5, devicePixelRatio || 1, 8192 / Math.max(1, rect.width, rect.height), Math.sqrt(12_000_000 / Math.max(1, rect.width * rect.height)));
  send({ type: 'layout', items, width: rect.width, height: rect.height, scale });
}
export function previewLayout() { if (!frame) frame = requestAnimationFrame(layout); }
export function previewActivity(value: boolean) { active = value; settings(); if (value) previewLayout(); }
export function attachCardPreview(element: HTMLElement, ref: ResourceRef, ready: () => void, fail: (error: string, informational?: boolean) => void) {
  const slot = { element, ref, ready, fail }; slots.add(slot); if (surfaceError) fail(surfaceError); previewLayout();
  return () => { slots.delete(slot); previewLayout(); };
}
export function mountPreviewSurface(container: HTMLElement, scroller: HTMLElement) {
  let cleanup = createSurface(container, scroller);
  const restart = () => { cleanup(); cleanup = createSurface(container, scroller); };
  restartSurface = restart;
  return () => { cleanup(); if (restartSurface === restart) restartSurface = undefined; };
}
function createSurface(container: HTMLElement, scroller: HTMLElement) {
  broken = false; surfaceError = undefined;
  host = container; scrollHost = scroller;
  const canvas = document.createElement('canvas'); canvas.className = 'viewer-preview-surface'; canvas.setAttribute('aria-hidden', 'true'); container.append(canvas);
  if (!canvas.transferControlToOffscreen) {
    broken = true; surfaceError = '当前运行环境不支持后台 GPU 预览，请更新 WebView2';
    for (const slot of slots) slot.fail(surfaceError);
    return () => { canvas.remove(); host = undefined; scrollHost = undefined; };
  }
  const owned = new Worker(new URL('./preview.worker.ts', import.meta.url), { type: 'module' }); worker = owned;
  owned.onmessage = async ({ data }: MessageEvent<PreviewReply>) => {
    if (data.type === 'read') {
      try {
        const result = data.texture ? await resolveResource(data.ref.sourceId, data.texture, data.ref.path) : { ref: data.ref, bytes: await readResource(data.ref) };
        if (worker === owned) owned.postMessage({ type: 'resource', request: data.request, bytes: result.bytes, identity: `${result.ref.sourceId}:${normalizePath(result.ref.path)}` } satisfies PreviewMessage, [result.bytes]);
      } catch (error) { if (worker === owned) send({ type: 'resource', request: data.request, error: String(error) }); }
    } else {
      if (data.type === 'error' && !data.key) { broken = true; surfaceError = data.error; }
      for (const slot of slots) if (!data.key || keyOf(slot.ref) === data.key) {
        if (data.type === 'ready') slot.ready(); else if (data.type === 'note') slot.fail(data.note, true); else slot.fail(data.error.replace(/^Error: /, ''));
      }
    }
  };
  owned.onerror = event => { broken = true; surfaceError = event.message || '后台模型预览失败'; for (const slot of slots) slot.fail(surfaceError); };
  const offscreen = canvas.transferControlToOffscreen(); send({ type: 'init', canvas: offscreen }, [offscreen]);
  const observer = new ResizeObserver(previewLayout); observer.observe(container); observer.observe(scroller);
  scroller.addEventListener('scroll', previewLayout, { passive: true }); window.addEventListener('resize', previewLayout);
  settings(); previewLayout();
  return () => {
    observer.disconnect(); scroller.removeEventListener('scroll', previewLayout); window.removeEventListener('resize', previewLayout);
    owned.terminate(); canvas.remove(); if (worker === owned) { worker = undefined; host = undefined; scrollHost = undefined; }
    cancelAnimationFrame(frame); frame = 0;
  };
}
useViewer.subscribe((state, previous) => {
  if (state.revision !== previous.revision) { if (broken && restartSurface) restartSurface(); else send({ type: 'clear' }); previewLayout(); }
  if (state.settings !== previous.settings) { settings(); previewLayout(); }
});
document.addEventListener('visibilitychange', () => { settings(); if (!document.hidden) previewLayout(); });
