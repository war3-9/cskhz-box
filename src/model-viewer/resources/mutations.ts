import { invoke, isTauri } from '@tauri-apps/api/core';
import { parseModelBytes } from './parse';
import { resourceKey, type Source } from '../types';
import { useViewer } from '../workspace/store';
import { sourceId } from './providers';

export interface ImportInput { path: string; textures: string[] }
export interface MutationResult { source: Source; renamed: Record<string, string>; backup?: string; changed: number }
export function mutationReason(source?: Source, operation: 'delete' | 'import' = 'import') {
  if (!isTauri()) return '本地文件操作请在桌面版使用';
  if (!source) return '请先打开模型文件夹或地图';
  if (source.kind === 'folder') return '';
  if (source.kind === 'archive' && /\.w3[xm]$/i.test(source.path) && (source.complete || operation === 'delete')) return '';
  return source.kind === 'archive' && !source.complete ? '此地图缺少完整文件清单，无法导入；可先导出到文件夹' : '此来源只读，请打开本地文件夹或普通地图';
}
export async function prepareImports(paths: string[]): Promise<ImportInput[]> {
  const result: ImportInput[] = [];
  for (const path of paths) {
    let textures: string[] = [];
    if (/\.(mdx|mdl)$/i.test(path)) {
      const bytes = await invoke<ArrayBuffer>('viewer_input_read', { path });
      const model = parseModelBytes(bytes, path);
      textures = model.Textures.map(texture => texture.Image).filter(Boolean);
    }
    result.push({ path, textures });
  }
  return result;
}
export async function mutateSource(source: Source, operation: 'delete' | 'import' | 'rename', paths: string[], options: { prefix?: string; start?: number; inputs?: ImportInput[]; destination?: string }) {
  const state = useViewer.getState();
  state.patch({ error: '', status: '正在处理文件' });
  try {
    const destination = operation === 'delete' ? undefined : options.destination;
    const result = await invoke<MutationResult>('viewer_mutate', { id: source.id, operation, paths, ...options, destination, newId: destination ? sourceId(destination) : source.id });
    const before = useViewer.getState();
    const mapping = (key: string) => {
      for (const path of paths) if (key === resourceKey(source, path)) return result.renamed[path] ? resourceKey(result.source, result.renamed[path]) : operation === 'delete' ? undefined : key;
      return key;
    };
    before.add(result.source, !destination);
    if (destination) before.patch({ kind: before.kind });
    if (!destination) before.patch({ selected: before.selected.map(mapping).filter((key): key is string => !!key), favorites: before.favorites.map(mapping).filter((key): key is string => !!key), categories: Object.fromEntries(Object.entries(before.categories).flatMap(([key, value]) => { const next = mapping(key); return next ? [[next, value]] : []; })), exportNames: Object.fromEntries(Object.entries(before.exportNames).flatMap(([key, value]) => { const next = mapping(key); return next ? [[next, value]] : []; })),
      ...(before.current?.sourceId === source.id && paths.includes(before.current.path) ? { current: result.renamed[before.current.path] ? { sourceId: source.id, path: result.renamed[before.current.path] } : undefined, detail: false } : {}) });
    before.patch({ status: `${operation === 'import' ? '导入' : operation === 'delete' ? '删除' : '重命名'}完成：${result.changed} 个文件${result.backup ? ` · 备份：${result.backup}` : ''}` });
    return result;
  } catch (error) { useViewer.getState().patch({ error: String(error) }); throw error; }
}
