import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TerrainMapInfo } from './types';
import { useTerrainClone } from './store';
const native = vi.hoisted(() => ({ invoke: vi.fn(), confirm: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke, isTauri: () => true }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: native.confirm }));
import { handleNativeMapDrop, mapSideAt } from './useNativeMapDrop';

const map = (id: string): TerrainMapInfo => ({ id, path: `F:/private/${id}.w3x`, name: `${id}.w3x`, width: 3, height: 3, pixels: Array(27).fill(64), dirty: false, canUndo: false, blank: false });
beforeEach(() => {
  native.invoke.mockReset(); native.confirm.mockReset(); native.confirm.mockResolvedValue(true);
  native.invoke.mockImplementation(async (command: string, args: { path?: string }) => command === 'terrain_clone_open_map' ? map(args.path?.includes('target') ? 'target' : 'source') : undefined);
  useTerrainClone.setState({ source: null, target: null, selection: null, placement: null, busy: false, message: '', log: [] });
  vi.stubGlobal('document', { querySelector: (selector: string) => ({ getBoundingClientRect: () => selector.includes('源地图') ? { left: 10, right: 210, top: 20, bottom: 220, width: 200, height: 200 } : { left: 230, right: 430, top: 20, bottom: 220, width: 200, height: 200 } }) });
});
afterEach(() => vi.unstubAllGlobals());

it('routes left and right canvas drops to separate sessions and does not reset the other map', async () => {
  await handleNativeMapDrop({ path: 'F:/private/source.w3x', position: [50, 80] });
  expect(useTerrainClone.getState().source?.id).toBe('source');
  useTerrainClone.getState().setSelection({ x0: 1, y0: 1, x1: 2, y1: 2, mask: null });
  await handleNativeMapDrop({ path: 'F:/private/target.w3m', position: [300, 80] });
  expect(useTerrainClone.getState().target?.id).toBe('target');
  expect(useTerrainClone.getState().selection?.x0).toBe(1);
  expect(useTerrainClone.getState().busy).toBe(false);
  expect(mapSideAt([210, 80])).toBeNull();
});

it('rejects drops between canvases, nonmaps and busy operations', async () => {
  await handleNativeMapDrop({ path: 'F:/private/source.w3x', position: [220, 80] });
  expect(native.invoke).not.toHaveBeenCalled();
  await handleNativeMapDrop({ path: 'F:/private/source.exe', position: [50, 80] });
  expect(native.invoke).not.toHaveBeenCalled();
  expect(useTerrainClone.getState().message).toContain('只支持');
  useTerrainClone.setState({ busy: true });
  await handleNativeMapDrop({ path: 'F:/private/source.w3x', position: [50, 80] });
  expect(native.invoke).not.toHaveBeenCalled();
  expect(useTerrainClone.getState().busy).toBe(true);
});

it('keeps unsaved target changes when replacement is canceled', async () => {
  const old = { ...map('old'), dirty: true, canUndo: true, undoSteps: 3 };
  useTerrainClone.setState({ target: old }); native.confirm.mockResolvedValue(false);
  await handleNativeMapDrop({ path: 'F:/private/target.w3x', position: [300, 80] });
  expect(useTerrainClone.getState().target).toBe(old);
  expect(native.invoke).not.toHaveBeenCalled();
  expect(useTerrainClone.getState().busy).toBe(false);
});

it('retains the old map after a failed open and ignores hidden canvas bounds', async () => {
  const old = map('old'); useTerrainClone.setState({ source: old });
  native.invoke.mockRejectedValue(new Error('读取失败'));
  await handleNativeMapDrop({ path: 'F:/private/source.w3x', position: [50, 80] });
  expect(useTerrainClone.getState().source).toBe(old);
  expect(useTerrainClone.getState().message).toContain('读取失败');
  vi.stubGlobal('document', { querySelector: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) }) });
  expect(mapSideAt([0, 0])).toBeNull();
});
