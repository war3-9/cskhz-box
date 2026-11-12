import { invoke } from '@tauri-apps/api/core';
import type { Source } from '../types';
import { modelTexturePaths } from './textureNames';

export interface MapPathIssue { model: string; path: string; kind: 'model' | 'texture' | 'read'; candidates: string[]; detail?: string }
export interface MapPathResult { models: number; textures: number; issues: MapPathIssue[] }
const key = (path: string) => path.replaceAll('/', '\\').toLowerCase();

/** Exact archive paths only. Never use the viewer's same-directory fallback here. */
export async function checkMapPaths(map: string, paths: string[], signal: AbortSignal, progress: (done: number) => void) {
  const id = `export-path-check-${crypto.randomUUID()}`;
  const check = () => { if (signal.aborted) throw new Error('检查已取消'); };
  const cancel = () => { void invoke('viewer_cancel', { id }).catch(() => {}); };
  signal.addEventListener('abort', cancel);
  const result: MapPathResult = { models: 0, textures: 0, issues: [] };
  try {
    check();
    const source = await invoke<Source>('viewer_open', { id, path: map, quick: true }); check();
    const entries = new Set(source.entries.filter(e => !e.anonymous).map(e => key(e.path)));
    const candidates = (path: string) => source.entries.filter(e => !e.anonymous && key(e.path).split('\\').at(-1) === key(path).split('\\').at(-1)).map(e => e.path).slice(0, 5);
    const checked = new Map<string, boolean>();
    for (const path of [...new Set(paths)]) {
      check();
      let bytes: Uint8Array;
      try { bytes = new Uint8Array(await invoke<ArrayBuffer>('viewer_read', { id, path })); }
      catch (error) { check(); result.issues.push({ model: path, path, kind: entries.has(key(path)) ? 'read' : 'model', candidates: candidates(path), detail: String(error) }); result.models++; progress(result.models); continue; }
      check();
      try {
        for (const texture of new Set(modelTexturePaths(bytes, path))) {
          check(); result.textures++;
          const normalized = key(texture);
          let exists = checked.get(normalized) ?? entries.has(normalized);
          if (!exists && !checked.has(normalized)) {
            // Even an incomplete listfile can contain a resource under this exact name.
            try { await invoke<ArrayBuffer>('viewer_read', { id, path: texture }); exists = true; } catch { check(); }
          }
          checked.set(normalized, exists);
          if (!exists) result.issues.push({ model: path, path: texture, kind: 'texture', candidates: candidates(texture) });
        }
      } catch (error) { check(); result.issues.push({ model: path, path, kind: 'read', candidates: [], detail: String(error) }); }
      result.models++; progress(result.models);
    }
    check(); return result;
  } finally {
    signal.removeEventListener('abort', cancel);
    await invoke('viewer_close', { id }).catch(() => {});
  }
}
