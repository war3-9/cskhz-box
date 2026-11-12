import { invoke } from '@tauri-apps/api/core';
import type { Source } from '../model-viewer/types';
import { normalizePath } from '../model-viewer/types';
import { allTextureLayers } from './native';
import { consoleImage } from './images';
import { defaultLayers, useConsole } from './store';
import { fontLayerId, type ConsoleFontSnapshot } from './fontTypes';
import { registerConsoleFont } from './fonts';

// Use known game paths directly, including archives without a usable listfile.
export async function openConsoleMap(path: string) {
  if (useConsole.getState().busy) return;
  if (!/\.w3[xm]$/i.test(path)) throw new Error('请选择魔兽争霸地图（w3x 或 w3m）');
  const id = `console-${crypto.randomUUID()}`;
  useConsole.setState({ busy: true });
  let opened = false;
  try {
    const fingerprint = await invoke<string>('console_map_fingerprint', { path });
    const source = await invoke<Source>('viewer_open', { path, id });
    opened = true;
    if (source.kind !== 'archive') throw new Error('所选文件不是 MPQ 地图归档');
    const layers = defaultLayers();
    let overrides = 0;
    for (const native of allTextureLayers) {
      const resource = native.archivePath;
      let bytes: ArrayBuffer;
      try { bytes = await invoke<ArrayBuffer>('viewer_read', { id, path: resource }); }
      catch (error) {
        const listed = source.entries.some(entry => normalizePath(entry.path) === normalizePath(resource));
        if (!listed && String(error).includes('资源不存在或已损坏')) continue;
        throw new Error(`读取 ${native.id} 失败：${String(error)}`);
      }
      const image = await consoleImage(bytes, resource);
      const item = layers.find(layer => layer.id === native.id)!;
      item.image = image; item.filename = resource;
      item.sourceBytes = Array.from(new Uint8Array(bytes)); overrides++;
    }
    // Keep the real map preview for restoring a user-added minimap; the initial canvas remains earth colored.
    let minimapBytes: ArrayBuffer | undefined;
    try { minimapBytes = await invoke<ArrayBuffer>('viewer_read', { id, path: 'war3mapMap.blp' }); }
    catch (error) {
      if (!String(error).includes('资源不存在或已损坏') || source.entries.some(entry => normalizePath(entry.path) === 'war3mapmap.blp')) throw error;
    }
    if (minimapBytes) {
      if (minimapBytes.byteLength > 20 * 1024 * 1024) throw new Error('地图预览贴图超过20MB');
      const item = layers.find(layer => layer.id === 'minimap-original')!;
      item.sourceBytes = Array.from(new Uint8Array(minimapBytes)); item.filename = 'war3mapMap.blp';
    }
    const fontSnapshot = await invoke<ConsoleFontSnapshot>('console_font_snapshot', { path });
    if (fontSnapshot?.preview) {
      try {
        const { family } = await registerConsoleFont(fontSnapshot.preview);
        const item = layers.find(layer => layer.id === fontLayerId)!;
        item.image = family; item.filename = '地图原有字体';
      } catch { /* Preserve original font bytes even when Chromium cannot preview this legacy font. */ }
    }
    const after = await invoke<string>('console_map_fingerprint', { path });
    if (fingerprint !== after) throw new Error('读取期间地图已变化，请重新打开');
    useConsole.getState().loadMap({ path, name: source.name, entries: source.entries.length,
      overrides, warning: source.warning, fingerprint }, layers, fontSnapshot);
    return { name: source.name, overrides };
  } finally {
    if (opened) await invoke('viewer_close', { id }).catch(() => {});
    useConsole.setState({ busy: false });
  }
}
