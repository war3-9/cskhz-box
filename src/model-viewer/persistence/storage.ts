import { invoke, isTauri } from '@tauri-apps/api/core';
import type { StateStorage } from 'zustand/middleware';
let pending = Promise.resolve();
let failure: unknown;
let latest: string | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const enqueue = () => {
  clearTimeout(timer); timer = undefined;
  if (latest === undefined) return;
  const text = latest; latest = undefined;
  pending = pending.catch(() => {}).then(() => invoke<void>('viewer_save_settings', { text })).then(() => { failure = undefined; }, error => { failure = error; });
};
export const viewerStorage: StateStorage = {
  getItem: async name => isTauri() ? invoke<string | null>('viewer_load_settings') : localStorage.getItem(name),
  setItem: (name, value) => {
    if (!isTauri()) { localStorage.setItem(name, value); return; }
    latest = value;
    if (!timer) timer = setTimeout(enqueue, 1000);
  },
  removeItem: name => { if (!isTauri()) localStorage.removeItem(name); },
};
export async function flushViewerPersistence() { enqueue(); await pending; if (failure) throw failure; }
