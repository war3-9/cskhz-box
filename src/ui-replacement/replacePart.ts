import { invoke } from '@tauri-apps/api/core';
import { isTexture } from '../model-viewer/types';
import { replacementHints } from './hoverParts';
import { consoleImage } from './images';
import { useConsole } from './store';
import { isFontTarget } from './fontTypes';

export const canReplacePart = (id: string) => id !== 'console' && !isFontTarget(id) && Object.hasOwn(replacementHints, id);

export async function replaceConsolePart(id: string, path: string) {
  if (!canReplacePart(id)) throw new Error('此组件不支持单张贴图替换');
  if (!isTexture(path)) throw new Error('请选择 BLP、TGA、DDS、PNG 或 JPG 贴图');
  const initial = useConsole.getState();
  if (initial.busy) throw new Error('正在读取，请稍后再试');
  if (!initial.map) throw new Error('请先打开你的地图');
  useConsole.setState({ busy: true });
  let image: string, sourceBytes: number[] | undefined;
  try {
    const bytes = await invoke<ArrayBuffer>('viewer_input_read', { path });
    image = await consoleImage(bytes, path);
    sourceBytes = /\.blp$/i.test(path) ? Array.from(new Uint8Array(bytes)) : undefined;
  } finally { useConsole.setState({ busy: false }); }
  if (useConsole.getState().map !== initial.map)
    throw new Error('当前地图已变化，请重新选择');
  useConsole.getState().replace([{ id, image, filename: path, sourceBytes }]);
}
