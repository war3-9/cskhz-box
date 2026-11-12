import { beforeEach, describe, expect, it } from 'vitest';
import { useObjectTable } from '../store';
import { initialSheets, initialViews, dataOnly, type ObjectProject } from '../model';
import { activateObjectTask, closeObjectTask, openObjectTask, restoreObjectWorkspace, serializeObjectWorkspace, taskDirty, taskProject, taskView, updateObjectTask, useObjectTasks } from './store';
import { parseObjectProject } from '../project';

const blank = (): ObjectProject => ({ format: 'war3-objects', version: 1, active: 'item', sheets: dataOnly(initialSheets()), views: initialViews() });
beforeEach(() => { useObjectTasks.setState({ tasks: [], activeId: null }); openObjectTask(); });
describe('物编任务隔离与迁移', () => {
  it('独立历史、分类、列宽、冻结、选择及滚动，重复打开激活已有任务', () => {
    const a = useObjectTasks.getState().activeId!, s = useObjectTable.getState(), unitRows = s.sheets.unit.rows;
    s.write('item', 0, 2, [['任务A']]); s.resizeColumn('item', 'item:D', 333); s.setView('item', { frozen: 3, left: 88, top: 112 });
    taskView(a, { selection: { start: { row: 3, col: 4 }, end: { row: 3, col: 4 } }, query: 'A' });
    const b = openObjectTask(blank(), 'F:/Maps/B.war3objects');
    useObjectTable.getState().write('unit', 0, 2, [['任务B']]); useObjectTable.getState().activate('unit');
    activateObjectTask(a); const restored = useObjectTable.getState();
    expect(restored.sheets.item.rows[0].cells['item:D']).toBe('任务A'); expect(restored.sheets.unit.rows).toBe(unitRows);
    expect(restored.sheets.item.columns[2].width).toBe(333); expect(restored.views.item).toEqual({ frozen: 3, left: 88, top: 112 });
    expect(useObjectTasks.getState().tasks.find(t => t.id === a)?.query).toBe('A');
    restored.undo(); expect(useObjectTable.getState().sheets.item.columns[2].width).not.toBe(333);
    activateObjectTask(b); expect(useObjectTable.getState().active).toBe('unit'); expect(useObjectTable.getState().sheets.unit.rows[0].cells['unit:D']).toBe('任务B');
    const size = useObjectTasks.getState().tasks.length; expect(openObjectTask(blank(), 'f:\\maps\\b.war3objects')).toBe(b); expect(useObjectTasks.getState().tasks).toHaveLength(size);
  });
  it('后台更新和迟到保存只进入目标任务，保存过程中新增修改仍脏', () => {
    const a = useObjectTasks.getState().activeId!; useObjectTable.getState().write('item', 0, 2, [['保存快照']]);
    const snapshot = useObjectTasks.getState().tasks.find(t => t.id === a)!;
    const b = openObjectTask();
    const rows = snapshot.data.sheets.item.rows;
    updateObjectTask(a, { savedRows: { ...snapshot.data.savedRows, item: rows } });
    expect(useObjectTable.getState().bookId).toBe(b); expect(useObjectTable.getState().sheets.item.rows[0].cells['item:D']).toBe('阿利亚之笛');
    activateObjectTask(a); useObjectTable.getState().write('item', 0, 2, [['保存后新修改']]);
    expect(taskDirty(useObjectTasks.getState().tasks.find(t => t.id === a)!)).toBe(true);
    closeObjectTask(a); expect(updateObjectTask(a, { path: 'F:/closed.war3objects' })).toBe(false);
  });
  it('多任务恢复保留公式、表头和绑定资料，不序列化撤销栈', () => {
    const a = useObjectTasks.getState().activeId!; useObjectTable.getState().write('item', 0, 2, [['=4+5']]);
    const b = openObjectTask(); useObjectTable.getState().write('unit', 2, 2, [['后台']]); activateObjectTask(a);
    const text = serializeObjectWorkspace(); expect(text).not.toContain('pastBooks'); expect(text).not.toContain('"past":');
    restoreObjectWorkspace(text); expect(useObjectTasks.getState().activeId).toBe(a); expect(useObjectTasks.getState().tasks).toHaveLength(2);
    expect(useObjectTable.getState().sheets.item.rows[0].cells['item:D']).toBe('=4+5'); expect(useObjectTable.getState().pastBooks).toHaveLength(0);
    activateObjectTask(b); expect(useObjectTable.getState().sheets.unit.rows[2].cells['unit:D']).toBe('后台');
  });
  it('自定义本地分类编辑后标脏，并在工作区保存恢复', () => {
    const id = 'custom-1', project = blank();
    project.active = id;
    project.customSheets = { [id]: { name: 'J全局', columns: [{ key: `${id}:A`, letter: 'A', title: 'A', field: '', width: 154 }], rows: [{ id: 'row-1', cells: { [`${id}:A`]: '初始内容' } }], auxiliary: {} } };
    project.views = { ...project.views, [id]: { frozen: 0, left: 0, top: 0 } };
    const parsed = parseObjectProject(JSON.stringify(project));
    openObjectTask(parsed);
    const taskId = useObjectTasks.getState().activeId!;
    useObjectTable.getState().write(id, 0, 0, [['编辑后的本地内容']]);
    expect(taskDirty(useObjectTasks.getState().tasks.find(task => task.id === taskId)!)).toBe(true);
    const text = serializeObjectWorkspace(); restoreObjectWorkspace(text);
    expect(useObjectTable.getState().sheets[id].rows[0].cells[`${id}:A`]).toBe('编辑后的本地内容');
    expect(taskProject(useObjectTasks.getState().tasks.find(task => task.id === taskId)!).customSheets?.[id].name).toBe('J全局');
  });
  it('旧版恢复迁为一个任务；关闭最后任务后重启仍为空', () => {
    restoreObjectWorkspace(JSON.stringify({ project: blank(), path: 'F:/legacy.war3objects', dirty: true }));
    expect(useObjectTasks.getState().tasks).toHaveLength(1); expect(taskDirty(useObjectTasks.getState().tasks[0])).toBe(true);
    closeObjectTask(useObjectTasks.getState().activeId!); expect(useObjectTasks.getState().activeId).toBeNull();
    restoreObjectWorkspace(serializeObjectWorkspace()); expect(useObjectTasks.getState().tasks).toEqual([]); expect(useObjectTasks.getState().activeId).toBeNull();
  });
  it('损坏恢复先验证后替换，版本1/2项目均可打开', () => {
    const old = useObjectTasks.getState(); expect(() => restoreObjectWorkspace('{"format":"war3-object-workspace","version":2,"tasks":[{"project":{}}]}')).toThrow();
    expect(useObjectTasks.getState()).toBe(old); expect(parseObjectProject(JSON.stringify(blank())).version).toBe(1);
    expect(parseObjectProject(JSON.stringify(taskProject(old.tasks[0]))).version).toBe(3);
  });
});
