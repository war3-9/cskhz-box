import { beforeEach, expect, it } from 'vitest';
import { defaultOptions, useTerrainClone } from './store';
import type { TerrainMapInfo } from './types';

const map = (id: string): TerrainMapInfo => ({ id, path: `F:/${id}.w3x`, name: `${id}.w3x`, width: 2, height: 2, pixels: Array(12).fill(64), dirty: false, canUndo: false, blank: false });

beforeEach(() => useTerrainClone.setState({
  source: null, target: null, selection: null, placement: null, mode: 'rectangle', brush: 3,
  shape: 'square', eraser: false, options: defaultOptions, log: [], busy: false, message: '',
}));

it('uses the competitor option defaults and toggles independent copy controls', () => {
  expect(useTerrainClone.getState().options).toEqual(defaultOptions);
  expect(useTerrainClone.getState().options.nativeCliffs).toBe(false);
  useTerrainClone.getState().setOption('cliffArt', true);
  expect(useTerrainClone.getState().options.cliffArt).toBe(true);
  expect(useTerrainClone.getState().options.terrain).toBe(true);
});

it('clearing a source map clears its selection while preserving the target map', () => {
  const state = useTerrainClone.getState();
  state.setMap('source', map('source'));
  state.setMap('target', map('target'));
  state.setSelection({ x0: 0, y0: 0, x1: 1, y1: 1, mask: null });
  state.setPlacement([1, 1]);
  useTerrainClone.getState().setMap('source', null);
  expect(useTerrainClone.getState().selection).toBeNull();
  expect(useTerrainClone.getState().placement).toEqual([1, 1]);
  expect(useTerrainClone.getState().target?.id).toBe('target');
});

it('clamps brush size and logs ordered operation messages', () => {
  useTerrainClone.getState().setBrush(140);
  useTerrainClone.getState().addLog(['打开地图', '复制区域']);
  expect(useTerrainClone.getState().brush).toBe(99);
  expect(useTerrainClone.getState().log).toEqual(['打开地图', '复制区域']);
});
