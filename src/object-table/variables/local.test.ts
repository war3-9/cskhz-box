import { beforeEach, describe, expect, it } from 'vitest';
import { initialSheets, initialViews, dataOnly } from '../model';
import { activateObjectTask, openObjectTask, restoreObjectWorkspace, serializeObjectWorkspace, taskDirty, taskProject, useObjectTasks } from '../tasks/store';
import { commitTaskVariables, travelTaskVariables } from './taskDocument';
import { parseObjectProject } from '../project';
import { mergeVariables } from './merge';
import type { GuiVariable } from './model';
const v = (name: string, initial = '1'): GuiVariable => ({ name, type: 'integer', array: false, size: 1, initial, initialized: true });
const blank = () => ({ format: 'war3-objects' as const, version: 3 as const, active: 'item' as const, sheets: dataOnly(initialSheets()), views: initialViews() });
beforeEach(() => useObjectTasks.setState({ tasks: [], activeId: null }));
describe('本地变量工作簿', () => {
  it('无需地图保存恢复，历史与物编及其他任务隔离', () => {
    const a = openObjectTask(blank()), b = openObjectTask(blank());
    const doc = { rows: [{ ...v('Local'), original: null }], baseline: [] };
    commitTaskVariables(a, doc);
    expect(useObjectTasks.getState().activeId).toBe(b);
    expect(taskDirty(useObjectTasks.getState().tasks[0])).toBe(true);
    expect(taskProject(useObjectTasks.getState().tasks[1]).variables).toBeUndefined();
    activateObjectTask(a); const original = taskProject(useObjectTasks.getState().tasks[0]).sheets;
    travelTaskVariables(a, false); expect(taskProject(useObjectTasks.getState().tasks[0]).variables).toBeUndefined();
    travelTaskVariables(a, true); expect(taskProject(useObjectTasks.getState().tasks[0]).variables).toEqual(doc);
    expect(taskProject(useObjectTasks.getState().tasks[0]).sheets).toEqual(original);
    const saved = serializeObjectWorkspace(); expect(JSON.parse(saved).version).toBe(2);
    restoreObjectWorkspace(saved); expect(taskProject(useObjectTasks.getState().tasks[0]).variables).toEqual(doc);
    expect(parseObjectProject(JSON.stringify(taskProject(useObjectTasks.getState().tasks[0]))).version).toBe(3);
  });
  it('旧工作簿不删除变量，外国来源不能改名删除；同源可合并改名及远程字段', () => {
    const remote = [v('Old'), v('Extra')];
    expect(mergeVariables(undefined, remote, false).changes).toEqual([]);
    const doc = { baseline: [v('Old')], rows: [{ ...v('New'), original: 'Old' }] };
    expect(mergeVariables(doc, remote, false).rows.map(v => v.name)).toEqual(['Old', 'Extra', 'New']);
    const same = mergeVariables(doc, [{ ...v('Old'), size: 4, array: true }, v('Extra')], true);
    expect(same.conflicts).toEqual([]); expect(same.rows.find(v => v.name === 'New')?.array).toBe(true);
    expect(same.changes[0].before?.name).toBe('Old');
    const deleted = mergeVariables({ baseline: [v('Old')], rows: [] }, remote, true);
    expect(deleted.rows.map(v => v.name)).toEqual(['Extra']);
  });
});
