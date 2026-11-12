import { Channel, invoke } from '@tauri-apps/api/core';
import type { ResourceRef } from '../types';
import { useViewer } from '../workspace/store';
import { safePath } from './output';

export interface NativeWork { sourceId: string; path: string; output: string; dependency?: boolean; renameTextures?: boolean }
export interface NativeProgress { done: number; total: number; models: number; textures: number; message: string; missing: string[]; failed: { work: NativeWork; error: string }[]; stopped: boolean }
let running: string | undefined;
export async function cancelNativeExport() { if (running) await invoke('viewer_cancel', { id: running }); }
export async function exportNative(work: { ref: ResourceRef; output: string; renameTextures?: boolean }[], directory: string, dependencies: boolean, update: (value: NativeProgress) => void) {
  const state = useViewer.getState();
  work = work.map(item => { const entry = state.sources.find(s => s.id === item.ref.sourceId)?.entries.find(e => e.path === item.ref.path); return entry?.readRef ? { ...item, ref: entry.readRef } : item; });
  const primary = [...new Set(work.map(item => item.ref.sourceId))];
  const sourceIds = [...primary, ...state.sources.filter(s => s.kind !== 'browser' && !primary.includes(s.id) && state.sourceRoles[s.path] === 'supplement').map(s => s.id), ...state.sources.filter(s => s.kind !== 'browser' && !primary.includes(s.id) && state.sourceRoles[s.path] === 'game').map(s => s.id)];
  const progress = new Channel<NativeProgress>(); progress.onmessage = update;
  const id = `viewer-export-${crypto.randomUUID()}`; running = id;
  try {
    return await invoke<NativeProgress>('viewer_export_raw', { id, directory, dependencies, sourceIds, progress,
      items: work.map(item => ({ sourceId: item.ref.sourceId, path: item.ref.path, output: safePath(item.output), renameTextures: !!item.renameTextures })) });
  } finally { if (running === id) running = undefined; }
}
