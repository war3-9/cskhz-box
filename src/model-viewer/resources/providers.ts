import { invoke, isTauri } from '@tauri-apps/api/core';
import { get, set, del } from 'idb-keyval';
import { chooseViewerPath } from './dialogs';
import type { ResourceRef, Source } from '../types';
import { normalizePath, isMusic, basename } from '../types';
import { useViewer } from '../workspace/store';
import { inspectFiles } from './inspection';
import { addTerrainResources } from './terrain';
import { resourceCandidates } from './resourceCandidates';
const browserFiles = new Map<string, Map<string, File>>();
let scanGeneration = 0;
let restoreGeneration = 0;
let supplementInput = false;
export function sourceId(path: string) { return `viewer-${Array.from(normalizePath(path)).reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0}`; }
export async function openNative(path: string, restore = false, role: 'primary' | 'supplement' | 'game' = 'primary') {
  if (useViewer.getState().fileBusy) return;
  if (!path) return;
  const audioPath = isMusic(path) ? basename(path) : undefined;
  if (audioPath) path = path.slice(0, path.length - audioPath.length);
  if (!restore) restoreGeneration++;
  if (useViewer.getState().busy) await cancelScan();
  const generation = ++scanGeneration;
  const id = sourceId(path), state = useViewer.getState();
  state.patch({ busy: id, error: '', status: `正在扫描：${path}` });
  try {
    let source = await invoke<Source>('viewer_open', { path, id });
    if (generation === scanGeneration) {
      if (role === 'primary' && /\.(w3x|w3m)$/i.test(path)) { await mountGameResources(path); await mountDetectedGameResources(); }
      else if (role === 'primary') await mountDetectedGameResources();
      if (/\.(w3x|w3m)$/i.test(path)) {
        try { source = await addTerrainResources(source, useViewer.getState().sources.filter(s => useViewer.getState().sourceRoles[s.path] === 'game').map(s => s.id)); }
        catch (error) { source = { ...source, warning: [source.warning, `地形纹理读取失败：${String(error)}`].filter(Boolean).join('；') }; }
      }
      if (generation === scanGeneration) { useViewer.getState().patch({ sourceRoles: { ...useViewer.getState().sourceRoles, [path]: role } }); useViewer.getState().add(source, restore || role !== 'primary'); if (!restore && audioPath) useViewer.getState().patch({ kind: 'music', current: { sourceId: source.id, path: audioPath } }); }
    }
  } catch (error) { if (generation === scanGeneration) useViewer.getState().patch({ error: String(error) }); }
  finally { if (generation === scanGeneration) useViewer.getState().patch({ busy: undefined }); }
}
export async function chooseSource(kind: 'folder' | 'model' | 'map' | 'mpq' | 'music', supplement = false) {
  if (useViewer.getState().fileBusy) return;
  if (!isTauri()) {
    if (kind === 'map' || kind === 'mpq') { useViewer.getState().patch({ error: '地图和 MPQ 归档请在桌面版打开' }); return; }
    supplementInput = supplement; document.getElementById(kind === 'folder' ? 'viewer-folder' : 'viewer-files')?.click(); return;
  }
  try {
    const value = await chooseViewerPath(kind === 'folder'
      ? { title: '打开模型文件夹', directory: true, recursive: true }
      : { title: kind === 'music' ? '打开音乐' : kind === 'map' ? '打开魔兽争霸 III 地图' : '打开魔兽资源', filters: [{ name: kind === 'map' ? '魔兽争霸 III 地图' : '魔兽资源', extensions: kind === 'music' ? ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] : kind === 'model' ? ['mdx', 'mdl'] : kind === 'map' ? ['w3x', 'w3m'] : ['mpq'] }] });
    if (typeof value === 'string') await openNative(value, false, supplement ? 'supplement' : 'primary');
  } catch (error) { useViewer.getState().patch({ error: String(error) }); }
}
export async function openFiles(files: File[]) {
  if (useViewer.getState().fileBusy) return;
  if (!files.length) return;
  restoreGeneration++;
  if (useViewer.getState().busy) await cancelScan();
  const root = files[0].webkitRelativePath?.split('/')[0];
  const signature = files.map(f => `${f.webkitRelativePath || f.name}:${f.size}:${f.lastModified}`).sort().join('|');
  const identity = root ? `${root}:${sourceId(signature)}` : signature;
  const path = `browser:${identity}`, id = sourceId(path);
  const entries = files.map(f => ({ path: root ? f.webkitRelativePath.slice(root.length + 1) : f.name, size: f.size, model: /\.(mdx|mdl)$/i.test(f.name), anonymous: false }));
  const inspected = await inspectFiles(files, entries.map(entry => entry.path), entries.map(entry => entry.model));
  for (const [index, group] of inspected.groups) Object.assign(entries[index], { modelGroup: group });
  const source: Source = { id, name: root || '导入模型', path, kind: 'browser', entries, complete: true, analysis: inspected.analysis };
  const map = new Map(entries.map((e, i) => [normalizePath(e.path), files[i]]));
  const supplement = supplementInput; supplementInput = false;
  browserFiles.set(id, map); useViewer.getState().patch({ sourceRoles: { ...useViewer.getState().sourceRoles, [path]: supplement ? 'supplement' : 'primary' } }); useViewer.getState().add(source, supplement);
  if (!supplement && entries.some(e => isMusic(e.path)) && !entries.some(e => e.model)) useViewer.getState().patch({ kind: 'music' });
  await set(`viewer-files:${path}`, { source, files: [...map] });
}
export async function restoreSources() {
  const generation = restoreGeneration;
  const paths = [...useViewer.getState().sessionPaths];
  for (const path of paths) {
    if (generation !== restoreGeneration) break;
    if (useViewer.getState().sources.some(s => s.path === path)) continue;
    if (path.startsWith('browser:')) {
      const saved = await get<{ source: Source; files: [string, File][] }>(`viewer-files:${path}`);
      if (generation !== restoreGeneration) break;
      if (saved) { browserFiles.set(saved.source.id, new Map(saved.files)); useViewer.getState().add(saved.source, true); }
    } else if (isTauri()) {
      if (useViewer.getState().sourceRoles[path] === 'game') { await mountGameResources(path); await mountDetectedGameResources(); }
      else await openNative(path, true, useViewer.getState().sourceRoles[path] || 'primary');
    }
  }
}
export async function readResource(ref: ResourceRef): Promise<ArrayBuffer> {
  const entry = useViewer.getState().sources.find(s => s.id === ref.sourceId)?.entries.find(e => normalizePath(e.path) === normalizePath(ref.path));
  if (entry?.terrain?.missing) throw new Error(`缺少地形纹理：${ref.path}，请挂载魔兽资源后重新扫描地图`);
  if (entry?.readRef && entry.readRef.sourceId !== ref.sourceId) return readResource(entry.readRef);
  const browser = browserFiles.get(ref.sourceId);
  if (browser) {
    const file = browser.get(normalizePath(ref.path)); if (!file) throw new Error(`资源不存在：${ref.path}`);
    const bytes = await file.arrayBuffer();
    const magic = new TextDecoder().decode(bytes.slice(0, 4));
    return isTauri() && ['MDB3', 'BLX1', 'MHAC', 'MHEB', 'MHEC', 'JRP1'].includes(magic) ? invoke<ArrayBuffer>('viewer_decode_resource', { bytes: Array.from(new Uint8Array(bytes)) }) : bytes;
  }
  return invoke<ArrayBuffer>('viewer_read', { id: ref.sourceId, path: ref.path });
}
export async function resolveResource(sourceId: string, path: string, modelPath?: string) {
  const { sources, sourceRoles } = useViewer.getState();
  const ordered = [...sources.filter(s => s.id === sourceId), ...sources.filter(s => s.id !== sourceId && sourceRoles[s.path] === 'supplement'), ...sources.filter(s => s.id !== sourceId && sourceRoles[s.path] === 'game')];
  const candidates = resourceCandidates(path, modelPath);
  for (const candidate of candidates) for (const source of ordered) {
    const entry = source.entries.find(e => normalizePath(e.path) === normalizePath(candidate));
    if (entry || source.kind === 'archive') {
      try { const ref = { sourceId: source.id, path: entry?.path || candidate }; return { ref, bytes: await readResource(ref), source: source.name }; }
      catch (error) { if (/BLX1|MDB3|MHAC|MHEB|MHEC|JRP1/.test(String(error))) throw error; /* Continue through explicitly mounted sources. */ }
    }
  }
  throw new Error(`缺少贴图：${path}`);
}
export async function closeSource(id: string) {
  if (useViewer.getState().fileBusy) return;
  const source = useViewer.getState().sources.find(s => s.id === id);
  if (!source) return;
  restoreGeneration++;
  if (isTauri() && source.kind !== 'browser') await invoke('viewer_close', { id });
  browserFiles.delete(id); await del(`viewer-files:${source.path}`); useViewer.getState().remove(id);
}
export async function cancelScan() { const id = useViewer.getState().busy; if (!id) return; scanGeneration++; useViewer.getState().patch({ busy: undefined, status: '扫描已取消' }); if (isTauri()) await invoke('viewer_cancel', { id }); }
export async function chooseGame() {
  if (useViewer.getState().fileBusy) return;
  if (!isTauri()) { useViewer.getState().patch({ error: '经典游戏 MPQ 挂载请在桌面版打开' }); return; }
  try {
    const directory = await chooseViewerPath({ title: '选择经典魔兽争霸 III 目录', directory: true }); if (typeof directory !== 'string') return;
    if (useViewer.getState().busy) await cancelScan();
    if (!await mountGameResources(directory)) throw new Error('此目录没有经典 Warcraft III MPQ 资源');
    const state = useViewer.getState(); if (!state.activeSource) state.patch({ activeSource: state.sources.find(s => state.sourceRoles[s.path] === 'game')?.id || '' });
  } catch (error) { useViewer.getState().patch({ error: String(error) }); }
}
async function mountGameResources(path: string) {
  const sources = await invoke<Source[]>('viewer_game_resources', { path });
  for (const source of sources) {
    const state = useViewer.getState();
    if (state.sources.some(item => item.id === source.id)) continue;
    state.patch({ sourceRoles: { ...state.sourceRoles, [source.path]: 'game' } }); state.add(source, true);
  }
  return sources.length;
}
async function mountDetectedGameResources() {
  const state = useViewer.getState();
  if (state.sources.some(source => state.sourceRoles[source.path] === 'game')) return;
  const sources = await invoke<Source[]>('viewer_game_resources', { path: '' });
  if (!Array.isArray(sources)) return;
  for (const source of sources) {
    const current = useViewer.getState();
    if (current.sources.some(item => item.id === source.id)) continue;
    current.patch({ sourceRoles: { ...current.sourceRoles, [source.path]: 'game' } }); current.add(source, true);
  }
}
