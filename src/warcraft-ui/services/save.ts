import { invoke, isTauri } from '@tauri-apps/api/core';
import { download } from '../../shared/download';
import { trackOperation } from '../runtime/operations';

export type SaveKind = 'project' | 'jass';
export async function saveText(kind: SaveKind, text: string): Promise<string> {
  return trackOperation(async () => {
    if (isTauri()) return invoke<string>('save_lab_text', { kind, text });
    const filename = kind === 'project' ? '魔兽UI设计.json' : '魔兽UI.j';
    download(new Blob([text], { type: kind === 'project' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' }), filename);
    return filename;
  });
}
