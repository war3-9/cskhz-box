import { invoke } from '@tauri-apps/api/core';
import { basename, isTexture, normalizePath, type Source } from '../model-viewer/types';
import { consoleReplacementTextures } from './native';
import { consoleImage } from './images';
import { useConsole, type ConsoleLayer } from './store';

export type ConsoleSourceKind = 'folder' | 'map';

export async function replaceConsoleFromSource(path: string, kind: ConsoleSourceKind) {
  const initial = useConsole.getState();
  if (initial.busy) throw new Error('正在读取，请稍后再试');
  if (!initial.map) throw new Error('请先打开你的地图');
  if (kind === 'map' && !/\.w3[xm]$/i.test(path)) throw new Error('请选择魔兽争霸地图（w3x 或 w3m）');
  const id = `console-replacement-${crypto.randomUUID()}`;
  const layers: ConsoleLayer[] = [];
  let opened = false, overrides = 0;
  useConsole.setState({ busy: true });
  try {
    const source = await invoke<Source>('viewer_open', { path, id });
    opened = true;
    if (source.kind !== (kind === 'map' ? 'archive' : 'folder')) throw new Error('所选来源类型不正确');
    const resources = consoleReplacementTextures.map(texture => {
      if (kind === 'map') return texture.archivePath;
      const candidates = source.entries.filter(entry => isTexture(entry.path) &&
        basename(entry.path).replace(/\.[^.]+$/, '').toLowerCase() === texture.id.toLowerCase());
      if (!candidates.length) {
        if (texture.id === 'human-console-buttonstates2') return null;
        throw new Error(`文件夹必须包含控制台的6张贴图，缺少：${texture.id}`);
      }
      if (candidates.length > 1) throw new Error(`存在多张同名贴图：${texture.id}，请只保留一张`);
      return candidates[0].path;
    });
    for (const [index, texture] of consoleReplacementTextures.entries()) {
      const resource = resources[index];
      if (!resource) { layers.push({ id: texture.id, image: texture.image, filename: `${texture.id}.blp` }); continue; }
      let bytes: ArrayBuffer;
      try { bytes = await invoke<ArrayBuffer>('viewer_read', { id, path: resource }); }
      catch (error) {
        const listed = source.entries.some(entry => normalizePath(entry.path) === normalizePath(resource));
        if (kind === 'map' && !listed && String(error).includes('资源不存在或已损坏')) {
          layers.push({ id: texture.id, image: texture.image, filename: `${texture.id}.blp` });
          continue;
        }
        throw new Error(`读取 ${texture.id} 失败：${String(error)}`);
      }
      layers.push({ id: texture.id, image: await consoleImage(bytes, resource), filename: resource,
        sourceBytes: /\.blp$/i.test(resource) ? Array.from(new Uint8Array(bytes)) : undefined });
      overrides++;
    }
  } finally {
    if (opened) await invoke('viewer_close', { id }).catch(() => {});
    useConsole.setState({ busy: false });
  }
  if (useConsole.getState().map !== initial.map)
    throw new Error('当前地图已变化，请重新选择');
  useConsole.getState().replace(layers);
  return { overrides };
}
