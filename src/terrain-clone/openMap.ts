import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import { useTerrainClone } from './store';
import type { TerrainMapInfo } from './types';

export async function openMapPath(side: 'source' | 'target', path: string) {
  if (!/\.w3[xm]$/i.test(path)) throw new Error('只支持 .w3x / .w3m 地图文件');
  const previous = useTerrainClone.getState()[side];
  if (previous?.dirty && !await confirm('当前地图有尚未保存的地形修改。是否放弃这些修改并打开另一张地图？', { title: '打开地图', kind: 'warning', okLabel: '放弃并打开', cancelLabel: '取消' })) return;
  const map = await invoke<TerrainMapInfo>('terrain_clone_open_map', { path });
  try { if (previous) await invoke('terrain_clone_close_map', { mapId: previous.id }); }
  catch (error) { await invoke('terrain_clone_close_map', { mapId: map.id }).catch(() => {}); throw error; }
  const latest = useTerrainClone.getState();
  latest.setMap(side, map);
  latest.addLog([`已打开${side === 'source' ? '源' : '目标'}地图：${map.name}（${map.width} × ${map.height}）`]);
  latest.addLog(map.previewWarnings ?? []);
}
