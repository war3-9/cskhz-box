import { beforeEach, expect, test, vi } from 'vitest';
import { useUiTasks, taskFrom } from './store';
import { useLayoutStore, exampleNodes } from '../state/layout';
import { useCanvasView } from '../canvas/view';
import { documentContent, isTaskDirty, needsSave, type SavedDesign } from './types';
import { saveTask } from './actions';
import { serializeLayout } from '../project/file';
import { useLayoutGesture } from '../state/gesture';
import { parseDesign, parseSession, serializeDesign, serializeSession, recoverLinks } from './schema';

beforeEach(() => { const task = taskFrom(); useUiTasks.getState().restore([task], task.id); });
const current = () => useUiTasks.getState().tasks.find(task => task.id === useUiTasks.getState().activeId)!;
const add = () => useLayoutStore.getState().add({ ...exampleNodes[0], id: crypto.randomUUID() });
const writer = vi.fn(async (design: SavedDesign) => ({ id: design.id, name: design.name, updatedAt: design.updatedAt }));

test('tasks isolate document, selection, view and reversible history', () => {
  add(); const first = current().id; const original = current().nodes;
  useLayoutStore.getState().setBackground('data:image/png;base64,YQ==');
  useCanvasView.setState({ grid: false, zoom: .5 });
  useUiTasks.getState().create(); add(); const second = current().id;
  useLayoutStore.getState().setNode(current().nodes[0].id, { x: 999 });
  useUiTasks.getState().activate(first);
  expect(current().nodes).toBe(original); expect(current().background).toContain('YQ==');
  expect(useCanvasView.getState().zoom).toBe(.5); expect(current().past).toHaveLength(2);
  useLayoutStore.getState().undo(); expect(current().background).toBeNull();
  useUiTasks.getState().activate(second); expect(current().nodes[0].x).toBe(999);
  useLayoutStore.getState().undo(); expect(current().nodes[0].x).toBe(exampleNodes[0].x);
});
test('untouched blanks do not block switching; saved baseline follows undo and redo', async () => {
  expect(isTaskDirty(current())).toBe(true); expect(needsSave(current())).toBe(false);
  add(); expect(needsSave(current())).toBe(true);
  await saveTask(current().id, '设计一', writer); expect(isTaskDirty(current())).toBe(false);
  useLayoutStore.getState().setNode(current().nodes[0].id, { x: 777 });
  expect(isTaskDirty(current())).toBe(true);
  useLayoutStore.getState().undo(); expect(isTaskDirty(current())).toBe(false);
  useLayoutStore.getState().redo(); expect(isTaskDirty(current())).toBe(true);
});
test('navigation belongs to each task, survives recovery and does not change saved content or history', async () => {
  add(); await saveTask(current().id, '导航', writer);
  const first = current(), past = first.past;
  useCanvasView.setState({ zoom: .8, panX: -150, panY: 217 });
  expect(isTaskDirty(current())).toBe(false); expect(current().past).toBe(past);
  useUiTasks.getState().create();
  expect(useCanvasView.getState()).toMatchObject({ zoom: null, panX: 0, panY: 0 });
  useUiTasks.getState().activate(first.id);
  expect(useCanvasView.getState()).toMatchObject({ zoom: .8, panX: -150, panY: 217 });
  const serialized = serializeSession(useUiTasks.getState().tasks, first.id);
  expect(parseSession(serialized).tasks[0].view).toMatchObject({ zoom: .8, panX: -150, panY: 217 });
  const legacy = JSON.parse(serialized);
  delete legacy.session.tasks[0].view.panX; delete legacy.session.tasks[0].view.panY;
  expect(parseSession(JSON.stringify(legacy)).tasks[0].view).toMatchObject({ panX: 0, panY: 0 });
});
test('saving a stale snapshot never marks new edits saved', async () => {
  add(); const id = current().id; let finish!: (value: { id: string; name: string; updatedAt: number }) => void;
  const pending = saveTask(id, '异步', design => new Promise(resolve => { finish = () => resolve(design); }));
  useLayoutStore.getState().setNode(current().nodes[0].id, { x: 888 });
  finish({ id: crypto.randomUUID(), name: '异步', updatedAt: Date.now() });
  expect(await pending).toBe(false); expect(isTaskDirty(current())).toBe(true);
});
test('save failures retain original task, document and saved baseline', async () => {
  add(); const before = current();
  await expect(saveTask(before.id, '失败', async () => { throw new Error('disk denied'); })).rejects.toThrow('disk denied');
  expect(current()).toBe(before); expect(isTaskDirty(current())).toBe(true);
});
test('deleting an open draft retains the canvas and next save creates a new identity', async () => {
  add(); await saveTask(current().id, '保留画布', writer);
  const oldId = current().saved!.id, original = current().nodes;
  useUiTasks.getState().detach(oldId);
  expect(current().nodes).toBe(original); expect(isTaskDirty(current())).toBe(true);
  await saveTask(current().id, '重新保存', writer); expect(current().saved!.id).not.toBe(oldId);
});
test('draft roundtrip contains Chinese text, custom image and reference background', () => {
  const design = { id: crypto.randomUUID(), name: '设计稿', updatedAt: 123,
    document: { nodes: [{ ...exampleNodes[0], imageData: 'data:image/png;base64,YQ==' }], arrayName: 'hud', background: 'data:image/png;base64,Yg==' } };
  expect(parseDesign(serializeDesign(design))).toEqual(design);
});
test('legacy workspace becomes an unsaved task; multi-task restore retains baseline without history', async () => {
  const legacy = parseSession(serializeLayout(exampleNodes, 'hud'));
  expect(legacy.tasks).toHaveLength(1); expect(isTaskDirty(legacy.tasks[0])).toBe(true);
  add(); await saveTask(current().id, '已保存', writer);
  const firstId = current().id;
  useUiTasks.getState().create(); add();
  const session = parseSession(serializeSession(useUiTasks.getState().tasks, current().id));
  expect(session.tasks).toHaveLength(2); expect(session.tasks.every(task => !task.past.length && !task.future.length)).toBe(true);
  expect(isTaskDirty(session.tasks.find(task => task.id === firstId)!)).toBe(false);
  expect(isTaskDirty(session.tasks.find(task => task.id === session.activeId)!)).toBe(true);
});
test('already open drafts reuse their tab; inactive close preserves active document', async () => {
  add(); await saveTask(current().id, '已有', writer); const first = current();
  useUiTasks.getState().create(); const second = current();
  useUiTasks.getState().open({ ...first.saved!, document: { nodes: first.nodes, arrayName: first.arrayName, background: first.background } });
  expect(current().id).toBe(first.id); expect(useUiTasks.getState().tasks).toHaveLength(2);
  useUiTasks.getState().close(second.id); expect(current().nodes).toBe(first.nodes);
});
test('invalid session identities and malformed saved documents are rejected', () => {
  const task = current(); const session = JSON.parse(serializeSession([task], task.id));
  session.session.activeId = 'missing'; expect(() => parseSession(JSON.stringify(session))).toThrow();
  expect(() => parseDesign('{}')).toThrow();
  expect(documentContent(task)).not.toBeNull();
});
test('migration recovery applies only records newer than the session, preserving newly opened conflict originals', () => {
  const id = crypto.randomUUID(), moved = crypto.randomUUID();
  const task = { ...current(), saved: { id, name: '目标已有稿', updatedAt: 1 } };
  const migrations = [{ revision: 1, ids: { [id]: moved } }, { revision: 2, ids: {} }];
  expect(recoverLinks([task], 0, migrations)[0].saved!.id).toBe(moved);
  expect(recoverLinks([task], 1, migrations)[0].saved!.id).toBe(id);
  expect(recoverLinks([task], 2, migrations)[0].saved!.id).toBe(id);
});

test('closing the last task leaves no tasks, canvas content, history or temporary gesture', () => {
  add(); const before = current();
  useLayoutStore.getState().setBackground('data:image/png;base64,YQ==');
  useCanvasView.setState({ zoom: .5 });
  useLayoutGesture.getState().begin(before.nodes, before.nodes[0].id);
  useUiTasks.getState().close(before.id);
  expect(useUiTasks.getState().tasks).toEqual([]); expect(useUiTasks.getState().activeId).toBeNull();
  expect(useLayoutStore.getState()).toMatchObject({ nodes: [], selectedId: null, past: [], future: [], background: null, arrayName: 'ui' });
  expect(useLayoutGesture.getState().drag).toBeNull(); expect(useCanvasView.getState().zoom).toBeNull();
  useUiTasks.getState().create(); expect(current().nodes).toEqual([]); expect(current().id).not.toBe(before.id);
});

test('an intentionally empty session restores without recreating a discarded design', () => {
  const session = parseSession(serializeSession([], null, 3));
  expect(session).toEqual({ tasks: [], activeId: null, directoryRevision: 3 });
  useUiTasks.getState().restore(session.tasks, session.activeId, session.directoryRevision);
  expect(useUiTasks.getState().tasks).toEqual([]); expect(useLayoutStore.getState().nodes).toEqual([]);
  const invalid = JSON.parse(serializeSession([], null)); invalid.session.activeId = 'removed';
  expect(() => parseSession(JSON.stringify(invalid))).toThrow('UI 任务数据无效');
  const activeMissing = JSON.parse(serializeSession([taskFrom()], null));
  expect(() => parseSession(JSON.stringify(activeMissing))).toThrow('UI 任务数据无效');
});

test('discarding modified task content preserves the saved draft for reopening', async () => {
  add(); await saveTask(current().id, '原保存稿', writer);
  const saved = writer.mock.calls.at(-1)![0], writes = writer.mock.calls.length;
  useLayoutStore.getState().setNode(current().nodes[0].id, { x: 987 });
  useUiTasks.getState().close(current().id);
  expect(writer.mock.calls).toHaveLength(writes); expect(useUiTasks.getState().tasks).toEqual([]);
  useUiTasks.getState().open(saved);
  expect(current().nodes).toEqual(saved.document.nodes); expect(isTaskDirty(current())).toBe(false);
});
