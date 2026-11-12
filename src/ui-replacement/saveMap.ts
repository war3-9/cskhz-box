import { invoke } from '@tauri-apps/api/core';
import { encodeBlp } from '../export/gameFormats/blp';
import { allTextureLayers } from './native';
import { useConsole, type ConsoleLayer } from './store';
import { fontLayerId } from './fontTypes';

export const changedConsoleLayers = (layers: ConsoleLayer[], saved: ConsoleLayer[]) => layers.filter(layer => {
  const previous = saved.find(item => item.id === layer.id);
  return previous?.image !== layer.image || previous?.filename !== layer.filename;
});

async function blpBytes(layer: ConsoleLayer): Promise<number[]> {
  const native = allTextureLayers.find(item => item.id === layer.id);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(`无法编码贴图：${layer.id}`)); image.src = layer.image;
  });
  const canvas = document.createElement('canvas');
  canvas.width = native?.textureWidth ?? 256; canvas.height = native?.textureHeight ?? 256;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return Array.from(encodeBlp({ width: canvas.width, height: canvas.height, data: new Uint8Array(pixels.data) }));
}

export async function saveConsoleMap() {
  const state = useConsole.getState();
  if (state.busy) return;
  if (!state.map?.fingerprint) throw new Error('请先重新打开地图');
  const changed = changedConsoleLayers(state.layers, state.savedLayers);
  if (!changed.length) return null;
  useConsole.setState({ busy: true });
  try {
    const changes = [];
    let font;
    for (const layer of changed) {
      if (layer.id === fontLayerId) {
        if (!state.fontSnapshot) throw new Error('缺少原地图字体配置，请重新打开地图');
        const baseline = state.originalLayers.find(item => item.id === fontLayerId);
        const reset = layer.image === baseline?.image && layer.filename === baseline?.filename;
        if (!reset && !layer.sourceBytes) throw new Error('字体数据无法读取，请重新选择字体');
        font = { reset, bytes: reset ? null : layer.sourceBytes,
          skin: reset ? state.fontSnapshot.skin : null, stored: reset ? state.fontSnapshot.stored : null };
        continue;
      }
      const native = allTextureLayers.find(item => item.id === layer.id);
      const path = native?.archivePath ?? (layer.id === 'minimap' ? 'war3mapMap.blp' : '');
      if (!path) throw new Error(`未知贴图：${layer.id}`);
      const original = !layer.image || (layer.image === native?.image && layer.filename === `${layer.id}.blp`);
      const minimapOriginal = layer.id === 'minimap' && !layer.image
        ? state.originalLayers.find(item => item.id === 'minimap-original')?.sourceBytes : undefined;
      changes.push({ path, bytes: minimapOriginal ?? layer.sourceBytes ?? (original ? null : await blpBytes(layer)) });
    }
    const result = await invoke<{ fingerprint: string; backup: string }>('console_save_map', {
      path: state.map.path, fingerprint: state.map.fingerprint, changes, ...(font ? { font } : {}),
    });
    useConsole.getState().markSaved(result.fingerprint);
    return result;
  } finally { useConsole.setState({ busy: false }); }
}
