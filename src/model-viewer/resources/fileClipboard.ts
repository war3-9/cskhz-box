import { invoke, isTauri } from '@tauri-apps/api/core';
import { exportPath } from '../export/naming';
import { safePath } from '../export/output';
import type { NativeWork } from '../export/native';
import type { Source } from '../types';
import { useViewer } from '../workspace/store';

export interface CopiedModelFiles { directory: string; models: number; textures: number; files: number }

export async function copyModelFiles(source: Source, paths: string[]) {
  const state = useViewer.getState();
  if (state.fileBusy || state.busy) return;
  if (!isTauri()) { state.patch({ error: '模型和贴图的文件复制请在 Windows 桌面版使用' }); return; }
  const models = source.entries.filter(entry => entry.model && paths.includes(entry.path));
  if (!models.length) { state.patch({ error: '请先选择或指向要复制的模型' }); return; }
  state.patch({ fileBusy: true, error: '', status: '正在准备模型和贴图文件' });
  try {
    const items: NativeWork[] = models.map(entry => ({ sourceId: source.id, path: entry.path,
      output: safePath(exportPath({ sourceId: source.id, path: entry.path }, state.sources, state.exportNames)), renameTextures: true }));
    const sourceIds = [source.id, ...state.sources.filter(item => item.id !== source.id && item.kind !== 'browser'
      && (state.sourceRoles[item.path] === 'supplement' || state.sourceRoles[item.path] === 'game')).map(item => item.id)];
    const result = await invoke<CopiedModelFiles>('viewer_copy_model_files', { items, sourceIds });
    useViewer.getState().patch({ status: `已复制 ${result.models} 个模型、${result.textures} 张贴图；可在 Windows 文件夹中按 Ctrl+V 粘贴` });
    return result;
  } catch (error) { useViewer.getState().patch({ error: String(error), status: '文件复制未完成' }); }
  finally { useViewer.getState().patch({ fileBusy: false }); }
}
