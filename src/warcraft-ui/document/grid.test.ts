import { expect, test } from 'vitest';
import { useLayoutStore, type UiNode } from '../state/layout';
import type { UiTexture } from './model';
import { frameRangeEnd, gridCells } from './grid';
import { parseLayout, serializeLayout } from '../project/file';
import { withFrameVariables } from './frameVariables';

const text: UiNode = { id: 'text', name: '文字', kind: 'text', x: 30, y: 40, width: 70, height: 20, color: '#ffffff' };
test('grid growth, add, undo and redo never reuse occupied or historical indices', () => {
  useLayoutStore.setState({ nodes: [], past: [], future: [], selectedId: null });
  const state = useLayoutStore.getState();
  state.add(text); state.add({ ...text, id: 'other' });
  state.setNode('text', { grid: { rows: 8, columns: 4, gapX: 12, gapY: 6 } });
  const grid = useLayoutStore.getState().nodes[0];
  expect(grid.frameIndex).toBeGreaterThan(useLayoutStore.getState().nodes[1].frameIndex!);
  expect(gridCells(grid).at(-1)).toMatchObject({ x: 276, y: 222, frameIndex: frameRangeEnd(grid) });
  state.undo(); expect(useLayoutStore.getState().nodes[0].grid).toBeUndefined();
  state.redo(); expect(useLayoutStore.getState().nodes[0]).toEqual(grid);
  state.add({ ...text, id: 'third' });
  expect(useLayoutStore.getState().nodes.at(-1)!.frameIndex).toBeGreaterThan(frameRangeEnd(grid));
  expect(parseLayout(serializeLayout(useLayoutStore.getState().nodes))).toEqual(useLayoutStore.getState().nodes);
});

test('cell materials persist, inherit defaults and reject malformed or out-of-range data', () => {
  const button: UiNode = { ...text, kind: 'button', texture: 'common.blp', imageData: 'data:image/png;base64,YQ==', grid: {
    rows: 2, columns: 2, gapX: 0, gapY: 0, materials: { '0:1': { texture: 'special.blp' }, '1:0': { texture: '' } },
  } };
  expect(gridCells(button).map(node => node.texture)).toEqual(['common.blp', 'special.blp', '', 'common.blp']);
  expect(gridCells(button)[1].imageData).toBeUndefined();
  expect(parseLayout(serializeLayout([button]))[0].grid).toEqual(button.grid);
  const invalid: Record<string, UiTexture>[] = [{ '2:0': { texture: 'x' } }, { '0:0': { texture: 'x', imageData: 'bad' } }, { '00:1': { texture: 'x' } }];
  for (const materials of invalid) {
    expect(() => serializeLayout([{ ...button, grid: { ...button.grid!, materials } }])).toThrow('单格素材');
  }
});
test('rejects overlapping slots, invalid grids and oversized total layouts', () => {
  const grid = { rows: 8, columns: 4, gapX: 0, gapY: 0 };
  expect(() => withFrameVariables([{ ...text, frameIndex: 1, grid }, { ...text, id: 'other', frameIndex: 20 }])).toThrow('重复');
  for (const invalid of [{ ...grid, rows: 0 }, { ...grid, columns: 1.5 }, { ...grid, gapX: -1 }, { ...grid, rows: 513 }]) {
    expect(() => serializeLayout([{ ...text, grid: invalid }])).toThrow();
  }
  expect(() => serializeLayout([{ ...text, grid: { ...grid, rows: 64, columns: 8 } }, { ...text, id: 'overflow' }])).toThrow('512');
  expect(() => withFrameVariables([{ ...text, frameIndex: 8190, grid }])).toThrow('8191');
});
