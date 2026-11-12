import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { attachTexture, updateTexture } from './texture';
import { useLayoutStore } from '../state/layout';
import type { UiNode } from '../document/model';
import { taskFrom, useUiTasks } from '../tasks/store';

const node = (id: string): UiNode => ({ id, kind: 'button', name: '', x: 100, y: 100, width: 100, height: 40, color: '#ffffff', text: 'Buy' });
let reader: { result: string; onload: () => void; onerror: () => void };
beforeEach(() => {
  useLayoutStore.setState({ nodes: [], selectedId: null, past: [], future: [] });
  vi.stubGlobal('FileReader', class {
    result = 'data:image/png;base64,YQ=='; onload = () => {}; onerror = () => {};
    constructor() { reader = this; } readAsDataURL() {}
  });
});
afterEach(() => vi.unstubAllGlobals());
const file = { name: 'asset.png', type: 'image/png' } as File;

test('asynchronous import remains attached to original node after selection changes, with one history record', async () => {
  const state = useLayoutStore.getState(); state.replace([node('a'),node('b')]); state.select('a');
  const before = useLayoutStore.getState().nodes, history = useLayoutStore.getState().past.length;
  const pending = attachTexture('a',file); state.select('b'); reader.onload(); await pending;
  expect(useLayoutStore.getState().selectedId).toBe('b');
  expect(useLayoutStore.getState().nodes[0].imageData).toBe(reader.result);
  expect(useLayoutStore.getState().nodes[1]).toEqual(before[1]);
  expect(useLayoutStore.getState().past).toHaveLength(history+1);
  state.undo(); expect(useLayoutStore.getState().nodes).toEqual(before);
  state.redo(); expect(useLayoutStore.getState().nodes[0].texture).toBe('war3mapImported\\asset.blp');
});

test('deleted or converted original target refuses late import and preserves current document', async () => {
  for (const deleted of [false,true]) {
    const state = useLayoutStore.getState(); state.replace([node('a'),node('b')]); state.select('a');
    const pending = attachTexture('a',file), assertion = expect(pending).rejects.toThrow('原控件');
    if (deleted) state.removeSelected(); else state.setNode('a',{kind:'text'});
    const current = useLayoutStore.getState().nodes; reader.onload(); await assertion;
    expect(useLayoutStore.getState().nodes).toBe(current);
  }
});

test('file read failure and unsupported formats leave nodes and history untouched', async () => {
  const state = useLayoutStore.getState(); state.replace([node('a')]);
  const before = useLayoutStore.getState();
  await expect(attachTexture('a',{...file,type:'image/gif'})).rejects.toThrow('PNG');
  const pending = attachTexture('a',file), assertion = expect(pending).rejects.toThrow('读取失败'); reader.onerror(); await assertion;
  expect(useLayoutStore.getState().nodes).toBe(before.nodes); expect(useLayoutStore.getState().past).toBe(before.past);
});
test('a late image read cannot affect another task even when node IDs match', async () => {
  const first = taskFrom({ nodes: [node('a')], arrayName: 'ui', background: null });
  const second = taskFrom({ nodes: [node('a')], arrayName: 'ui', background: null });
  useUiTasks.getState().restore([first, second], first.id);
  const pending = attachTexture('a', file), assertion = expect(pending).rejects.toThrow('任务已切换');
  useUiTasks.getState().activate(second.id); const before = useLayoutStore.getState().nodes;
  reader.onload(); await assertion;
  expect(useLayoutStore.getState().nodes).toBe(before);
  expect(useUiTasks.getState().tasks.every(task => !task.nodes[0].imageData)).toBe(true);
});

test('single-cell imports, clear, restore and history preserve common and other cell materials', async () => {
  const state = useLayoutStore.getState();
  state.replace([{ ...node('a'), texture: 'common.blp', grid: { rows: 2, columns: 2, gapX: 0, gapY: 0 } }]);
  const before = useLayoutStore.getState().nodes;
  const pending = attachTexture('a', file, 2); reader.onload(); await pending;
  expect(useLayoutStore.getState().nodes[0].grid!.materials).toEqual({ '1:0': { texture: 'war3mapImported\\asset.blp', imageData: reader.result } });
  expect(useLayoutStore.getState().nodes[0].texture).toBe('common.blp');
  state.undo(); expect(useLayoutStore.getState().nodes).toEqual(before); state.redo();
  updateTexture('a', { texture: '' }, 2);
  expect(useLayoutStore.getState().nodes[0].grid!.materials!['1:0'].texture).toBe('');
  updateTexture('a', null, 2);
  expect(useLayoutStore.getState().nodes[0].grid!.materials).toEqual({});
});

test('a delayed single-cell import rejects a changed grid', async () => {
  const state = useLayoutStore.getState();
  state.replace([{ ...node('a'), grid: { rows: 2, columns: 2, gapX: 0, gapY: 0 } }]);
  const pending = attachTexture('a', file, 2), assertion = expect(pending).rejects.toThrow('排列已变化');
  state.setNode('a', { grid: { rows: 2, columns: 3, gapX: 0, gapY: 0 } });
  const current = useLayoutStore.getState().nodes; reader.onload(); await assertion;
  expect(useLayoutStore.getState().nodes).toBe(current);
});
