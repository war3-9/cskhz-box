import { invoke, isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { download } from '../../shared/download';

export async function saveCapture(blob: Blob, name: string, directory: string): Promise<string | null> {
  const stem = name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 120) || '模型';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${stem}-${stamp}-${crypto.randomUUID().slice(0, 8)}.png`;
  if (!isTauri()) { download(blob, filename); return filename; }
  let path = directory ? `${directory.replace(/[\\/]$/, '')}\\${filename}` : await save({ title: '保存模型 PNG', defaultPath: filename, filters: [{ name: 'PNG 图片', extensions: ['png'] }] });
  if (!path) return null;
  if (!path.toLowerCase().endsWith('.png')) path += '.png';
  await invoke('write_file', { path, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
  return path;
}
