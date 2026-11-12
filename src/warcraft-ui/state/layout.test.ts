import { beforeEach, expect, test } from 'vitest';
import { exampleNodes, initialNodes, useLayoutStore } from './layout';

beforeEach(() => useLayoutStore.setState({ nodes: structuredClone(exampleNodes), selectedId: exampleNodes[0].id, past: [], future: [] }));
test('layer reordering keeps identities and selection, supports undo and ignores boundaries', () => {
  useLayoutStore.getState().reorder('bottom');
  expect(useLayoutStore.getState().past).toHaveLength(0);
  useLayoutStore.getState().reorder('top');
  expect(useLayoutStore.getState().nodes).toEqual([exampleNodes[1], exampleNodes[0]]);
  expect(useLayoutStore.getState().selectedId).toBe(exampleNodes[0].id);
  useLayoutStore.getState().reorder('up');
  expect(useLayoutStore.getState().past).toHaveLength(1);
  useLayoutStore.getState().undo();
  expect(useLayoutStore.getState().nodes).toEqual(exampleNodes);
  useLayoutStore.getState().redo();
  expect(useLayoutStore.getState().nodes.map(node => node.tVariable)).toEqual(['War3Lab_1', 'War3Lab_0']);
});
test('new workspace state is empty and has no implicit selection', () => {
  expect(initialNodes).toEqual([]);
  useLayoutStore.setState({ nodes: structuredClone(initialNodes), selectedId: null, past: [], future: [] });
  expect(useLayoutStore.getState().nodes).toEqual([]);
  expect(useLayoutStore.getState().selectedId).toBeNull();
});
test('clearing a populated layout is a reversible document change', () => {
  useLayoutStore.getState().replace([]);
  expect(useLayoutStore.getState().nodes).toEqual([]);
  expect(useLayoutStore.getState().selectedId).toBeNull();
  expect(useLayoutStore.getState().past).toHaveLength(1);
  useLayoutStore.getState().undo();
  expect(useLayoutStore.getState().nodes).toEqual(exampleNodes);
});
test('selection does not enter history, drag commits one reversible change', () => {
  useLayoutStore.getState().select(exampleNodes[1].id);
  expect(useLayoutStore.getState().past).toHaveLength(0);
  useLayoutStore.getState().setNode(exampleNodes[1].id, { x: 190, y: 180 });
  expect(useLayoutStore.getState().past).toHaveLength(1);
  useLayoutStore.getState().undo();
  expect(useLayoutStore.getState().nodes[1].x).toBe(155);
  useLayoutStore.getState().redo();
  expect(useLayoutStore.getState().nodes[1].x).toBe(190);
});
test('invalid size and missing IDs preserve state', () => {
  useLayoutStore.getState().setNode(exampleNodes[0].id, { width: 0 });
  useLayoutStore.getState().setNode(exampleNodes[0].id, { x: Number.NaN });
  useLayoutStore.getState().setNode('missing', { width: 120 });
  expect(useLayoutStore.getState().nodes).toEqual(exampleNodes);
  expect(useLayoutStore.getState().past).toHaveLength(0);
});
test('a new edit after undo clears redo', () => {
  useLayoutStore.getState().removeSelected();
  useLayoutStore.getState().undo();
  useLayoutStore.getState().setNode(exampleNodes[0].id, { width: 200 });
  expect(useLayoutStore.getState().future).toHaveLength(0);
});
test('deletion and undo/redo retain permanent variable identities including newly added nodes', () => {
  useLayoutStore.getState().removeSelected();
  expect(useLayoutStore.getState().nodes[0].tVariable).toBe('War3Lab_1');
  useLayoutStore.getState().add({ ...exampleNodes[1], id: 'new-control', tVariable: undefined, autoName: undefined, frameIndex: undefined });
  const name = useLayoutStore.getState().nodes[1].frameIndex;
  expect(name).toBe(3);
  useLayoutStore.getState().undo();
  useLayoutStore.getState().redo();
  expect(useLayoutStore.getState().nodes[1].frameIndex).toBe(name);
});
