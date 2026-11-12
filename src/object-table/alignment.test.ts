import { initialSheets } from './model';
import { beforeEach, describe, expect, it } from 'vitest';
import { isObjectDirty, useObjectTable } from './store';
import { currentProject, parseObjectProject, serializeObjectProject } from './project';
import { selectionAlignment } from './alignment';
import { activateObjectTask, openObjectTask, restoreObjectWorkspace, serializeObjectWorkspace, useObjectTasks } from './tasks/store';
import { generateMacros } from './export';
import { applyNativeObject } from './native/mapping';

const range = (r1 = 0, c1 = 0, r2 = r1, c2 = c1) => ({ start: { row: r1, col: c1 }, end: { row: r2, col: c2 } });
beforeEach(() => useObjectTable.getState().restore({ ...currentProject(), sheets: initialSheets(), metadata: undefined }));

describe('单元格对齐与记忆', () => {
  it('选区独立设置，混合选区无高亮，重复设置不增加历史', () => {
    const s = useObjectTable.getState();
    s.setAlignment('item', range(0, 1, 1, 2), 'center');
    let sheet = useObjectTable.getState().sheets.item;
    expect(selectionAlignment(sheet, range(0, 1, 1, 2))).toBe('center');
    expect(selectionAlignment(sheet, range(0, 0, 1, 2))).toBeNull();
    expect(sheet.rows[0].cells).toEqual({});
    expect(sheet.rows[0].alignments).toEqual({ 'item:C': 'center', 'item:D': 'center' });
    const history = useObjectTable.getState().pastBooks;
    s.setAlignment('item', range(1, 2, 0, 1), 'center');
    expect(useObjectTable.getState().pastBooks).toBe(history);
    s.setAlignment('item', range(1, 2), 'right');
    sheet = useObjectTable.getState().sheets.item;
    expect(selectionAlignment(sheet, range(0, 1, 1, 2))).toBeNull();
    expect(sheet.rows[0].alignments?.['item:D']).toBe('center');
    expect(useObjectTable.getState().sheets.unit.rows).toEqual([]);
  });
  it('空白单元格先设置再输入，清空内容仍保留对齐并可撤销重做', () => {
    const s = useObjectTable.getState();
    s.setAlignment('item', range(2, 2), 'right');
    expect(isObjectDirty(useObjectTable.getState())).toBe(true);
    s.undo(); expect(isObjectDirty(useObjectTable.getState())).toBe(false);
    s.redo(); s.write('item', 2, 2, [['中文']]); s.clear('item', 2, 2, 2, 2);
    expect(useObjectTable.getState().sheets.item.rows[2]).toMatchObject({ cells: {}, alignments: { 'item:D': 'right' } });
    s.setAlignment('item', range(2, 2), 'left');
    expect(useObjectTable.getState().sheets.item.rows[2].alignments).toBeUndefined();
    s.undo(); expect(useObjectTable.getState().sheets.item.rows[2].alignments?.['item:D']).toBe('right');
  });
  it('工作簿保存回读兼容旧文件，拒绝非法对齐及不存在的列', () => {
    const s = useObjectTable.getState(); s.setAlignment('item', range(0, 2), 'center');
    const project = parseObjectProject(serializeObjectProject());
    s.restore(project); expect(selectionAlignment(useObjectTable.getState().sheets.item, range(0, 2))).toBe('center');
    expect(isObjectDirty(useObjectTable.getState())).toBe(false);
    delete project.sheets.item.rows[0].alignments;
    expect(parseObjectProject(JSON.stringify(project)).sheets.item.rows[0].alignments).toBeUndefined();
    project.sheets.item.rows[0].alignments = { 'item:ZZZ': 'center' };
    expect(() => parseObjectProject(JSON.stringify(project))).toThrow('不存在的列');
    expect(() => parseObjectProject(JSON.stringify(project).replace('center', 'justify'))).toThrow();
  });
  it('任务切换、关闭重开工作区分别恢复各任务的对齐方式', () => {
    const first = useObjectTasks.getState().activeId!;
    useObjectTable.getState().setAlignment('item', range(), 'center');
    const second = openObjectTask();
    expect(selectionAlignment(useObjectTable.getState().sheets.item, range())).toBe('left');
    useObjectTable.getState().setAlignment('item', range(), 'right');
    activateObjectTask(first); expect(selectionAlignment(useObjectTable.getState().sheets.item, range())).toBe('center');
    restoreObjectWorkspace(serializeObjectWorkspace());
    expect(selectionAlignment(useObjectTable.getState().sheets.item, range())).toBe('center');
    activateObjectTask(second); expect(selectionAlignment(useObjectTable.getState().sheets.item, range())).toBe('right');
  });
  it('插入删除行时对齐随行移动，物编导出字节不受格式影响', () => {
    const s = useObjectTable.getState(); s.write('item', 0, 0, [['I001', 'ratf', '中文']]);
    const original = generateMacros(currentProject(), ['item']);
    s.setAlignment('item', range(0, 0, 0, 2), 'center');
    s.setAlignment('item', range(5, 2), 'right');
    expect(generateMacros(currentProject(), ['item'])).toEqual(original);
    s.insertRows(0, 1); expect(useObjectTable.getState().sheets.item.rows[1].alignments?.['item:D']).toBe('center');
    expect(useObjectTable.getState().sheets.item.rows[0].alignments).toBeUndefined();
    s.removeRows(0, 0); expect(useObjectTable.getState().sheets.item.rows[0].alignments?.['item:D']).toBe('center');
  });
  it('越界操作拒绝且不改变工作簿', () => {
    const s = useObjectTable.getState(), before = s.sheets;
    expect(() => s.setAlignment('item', range(-1), 'center')).toThrow();
    expect(() => s.setAlignment('item', range(100000), 'right')).toThrow();
    expect(() => s.setAlignment('item', range(0, 999), 'left')).toThrow();
    expect(useObjectTable.getState().sheets).toBe(before);
    s.setAlignment('item', range(0, 0, 5, 2), 'left');
    expect(useObjectTable.getState().sheets).toBe(before);
  });
  it('编辑器同步回读替换单元格时保留原行对齐', () => {
    const s = useObjectTable.getState(); s.write('item', 0, 0, [['I001', 'ratf']]);
    s.setAlignment('item', range(0, 0, 0, 2), 'center');
    const sheet = useObjectTable.getState().sheets.item;
    const next = applyNativeObject(sheet, { id: 'I001', parent: 'ratf', custom: true, fields: {} }, 'item', 'I001');
    expect(next.rows[0].id).toBe(sheet.rows[0].id);
    expect(next.rows[0].alignments).toEqual(sheet.rows[0].alignments);
  });
});
