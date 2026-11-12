import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { decodeTexture } from '../../model-viewer/resources/textures';
import { useObjectTable } from '../store';
interface Source { id: string }
let sources: Promise<Source[]> | undefined, revision = 0;
const cache = new Map<string, Promise<string | null>>(), queue: (() => void)[] = []; let active = 0;
const schedule = <T,>(task: () => Promise<T>) => new Promise<T>((resolve, reject) => { const run = () => { active++; void task().then(resolve, reject).finally(() => { active--; queue.shift()?.(); }); }; if (active < 3) run(); else queue.push(run); });
function gameSources() {
  return sources ??= (async () => {
    const configured = localStorage.getItem('object-table-editor-root') ?? '';
    const registered = await invoke<Source[]>('viewer_game_resources', { path: configured }); if (registered.length) return registered;
    // The installed editor path is detected by the application's existing read-only detector.
    const editor = await invoke<string>('detect_editor_resource_directory').catch(() => '');
    return editor ? invoke<Source[]>('viewer_game_resources', { path: editor }) : [];
  })().catch(error => { sources = undefined; throw error; });
}
export async function chooseIconDirectory() {
  if (!isTauri()) throw new Error('读取编辑器 MPQ 图标需要桌面版；浏览器使用内置图标。');
  const path = await open({ directory: true, multiple: false, title: '选择魔兽编辑器所在的游戏目录（包含 War3.mpq）' }); if (typeof path !== 'string') return false;
  const found = await invoke<Source[]>('viewer_game_resources', { path }); if (!found.length) throw new Error('此目录及其上级没有找到经典魔兽 MPQ，请选择实际的魔兽目录。');
  localStorage.setItem('object-table-editor-root', path); sources = Promise.resolve(found); revision++; cache.clear(); return true;
}
export function templateIcon(art: string): Promise<string | null> {
  if (!isTauri() || !art) return Promise.resolve(null);
  const binding = useObjectTable.getState().metadata?.binding;
  const key = `${revision}:${binding?.path ?? ''}:${binding?.fingerprint ?? ''}:${art}`; if (cache.has(key)) return cache.get(key)!;
  const result = schedule(async () => {
    const paths = art.match(/[^"{},]+\.(?:blp|tga|png)/gi) ?? [];
    const render = async (bytes: ArrayBuffer, path: string) => { const [image] = await decodeTexture(bytes, path, 32), canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d')!.putImageData(image, 0, 0); return canvas.toDataURL('image/png'); };
    if (binding) for (const path of paths) {
      try { return await render(await invoke<ArrayBuffer>('object_map_resource', { path: binding.path, resource: path.trim(), expected: binding.fingerprint }), path); } catch { /* Only read a verified map; fall back to configured game resources. */ }
    }
    const archives = await gameSources();
    for (const path of paths) for (const source of archives) {
      try {
        const bytes = await invoke<ArrayBuffer>('viewer_read', { id: source.id, path: path.trim() });
        return await render(bytes, path);
      } catch { /* Try the next archive; source archives are opened read-only. */ }
    }
    return null;
  }).catch(() => null); cache.set(key, result); return result;
}
