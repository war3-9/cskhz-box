import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openMapPath } from './openMap';
import { useTerrainClone } from './store';

export function mapSideAt(position: [number, number]): 'source' | 'target' | null {
  for (const side of ['source', 'target'] as const) {
    const canvas = document.querySelector<HTMLCanvasElement>(`canvas[aria-label="${side === 'source' ? '源' : '目标'}地图画布"]`);
    const bounds = canvas?.getBoundingClientRect();
    if (bounds && bounds.width > 0 && bounds.height > 0 && position[0] >= bounds.left && position[0] < bounds.right && position[1] >= bounds.top && position[1] < bounds.bottom) return side;
  }
  return null;
}

export async function handleNativeMapDrop(payload: { path: string; position: [number, number] }) {
  const current = useTerrainClone.getState();
  if (current.busy) { current.notify('请等待当前操作完成后再拖入地图。'); return; }
  const side = mapSideAt(payload.position);
  if (!side) { current.notify('请将地图拖到源地图或目标地图画布。'); return; }
  current.setBusy(true); current.notify('');
  try { await openMapPath(side, payload.path); }
  catch (error) { const latest = useTerrainClone.getState(); latest.notify(String(error)); latest.addLog([`打开地图失败：${String(error)}`]); }
  finally { useTerrainClone.getState().setBusy(false); }
}

export function useNativeMapDrop(active: boolean) {
  useEffect(() => {
    if (!active || !isTauri()) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    let drops = Promise.resolve();
    void listen<{ path: string; position: [number, number] }>('terrain-clone-drop-path', event => {
      drops = drops.then(async () => {
        if (disposed) return;
        await handleNativeMapDrop(event.payload);
      }).catch(error => useTerrainClone.getState().notify(String(error)));
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten; })
      .catch(error => useTerrainClone.getState().notify(String(error)));
    return () => { disposed = true; stop?.(); };
  }, [active]);
}
