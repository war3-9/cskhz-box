import { invoke } from '@tauri-apps/api/core';
import type { Source } from '../types';
interface TerrainResource { path: string; name: string; terrainType: string; used: boolean; sourceId: string | null; size: number }
export async function addTerrainResources(source: Source, gameIds: string[]): Promise<Source> {
  if (!/\.(w3x|w3m)$/i.test(source.path)) return source;
  const resources = await invoke<TerrainResource[]>('viewer_terrain_resources', { id: source.id, gameIds });
  const entries = [...source.entries];
  for (const item of resources) {
    const existing = entries.findIndex(entry => entry.path.replace(/\\/g, '/').toLowerCase() === item.path.replace(/\\/g, '/').toLowerCase());
    const entry = { ...(existing >= 0 ? entries[existing] : { path: item.path, model: false, anonymous: false }), size: item.size,
      terrain: { name: item.name, terrainType: item.terrainType, used: item.used, missing: !item.sourceId },
      ...(item.sourceId && item.sourceId !== source.id ? { readRef: { sourceId: item.sourceId, path: item.path } } : {}) };
    if (existing >= 0) entries[existing] = entry; else entries.push(entry);
  }
  return { ...source, entries };
}
