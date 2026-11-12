import { initialSheets } from './model';
import { beforeEach, describe, expect, it } from 'vitest';
import { categories, categoryById } from './schema';
import { useObjectTable } from './store';

const initial = { ...useObjectTable.getInitialState(), sheets: initialSheets() };
beforeEach(() => useObjectTable.setState(initial, true));
describe('物编表格：原表结构与独立草稿', () => {
  it('保留六类不同表头、字段大小写和原始列位置', () => {
    expect(categories.map(category => [category.id, category.columns.length])).toEqual([
      ['item', 41], ['unit', 124], ['ability', 122], ['upgrade', 10], ['doodad', 13], ['buff', 7],
    ]);
    expect(categoryById.item.columns[4]).toMatchObject({ title: '提示工具-基础', field: 'Tip' });
    expect(categoryById.unit.columns[6]).toMatchObject({ title: '基础伤害', field: 'dmgplus1' });
    expect(categoryById.ability.columns[3]).toMatchObject({ title: '等级', field: 'levels' });
    expect(categoryById.buff.columns[2]).toMatchObject({ title: '提示工具', field: 'Bufftip' });
    for (const category of categories) expect(new Set(category.columns.map(column => column.key)).size).toBe(category.columns.length);
  });
  it('重复字段按原列独立编辑，清空仍可撤销', () => {
    const store = useObjectTable.getState(); store.activate('ability');
    const row = store.addRow();
    const duplicates = categoryById.ability.columns.filter(column => column.field === 'DataD1');
    expect(duplicates).toHaveLength(2);
    store.changeCell('ability', row, duplicates[0].key, 'first');
    store.changeCell('ability', row, duplicates[1].key, 'second');
    expect(useObjectTable.getState().sheets.ability.rows[0].cells).toEqual({ [duplicates[0].key]: 'first', [duplicates[1].key]: 'second' });
    store.changeCell('ability', row, duplicates[0].key, ''); store.undo();
    expect(useObjectTable.getState().sheets.ability.rows[0].cells[duplicates[0].key]).toBe('first');
  });
  it('新增、编辑、删除的历史按类别隔离，切换后仍保留', () => {
    const store = useObjectTable.getState(), item = store.addRow();
    store.changeCell('item', item, 'item:D', '测试物品');
    store.activate('unit'); const unit = store.addRow();
    store.changeCell('unit', unit, 'unit:H', '25'); store.undo();
    expect(useObjectTable.getState().sheets.unit.rows[0].cells).toEqual({});
    expect(useObjectTable.getState().sheets.item.rows[0].cells['item:D']).toBe('测试物品');
    store.redo(); store.removeRow(unit); store.undo();
    expect(useObjectTable.getState().sheets.unit.rows[0].cells['unit:H']).toBe('25');
  });
  it('忽略无效列及不变的编辑；撤销后新修改清除重做', () => {
    const store = useObjectTable.getState(), row = store.addRow();
    store.changeCell('item', row, 'unit:D', '错误字段');
    store.changeCell('item', row, 'item:D', '');
    expect(useObjectTable.getState().sheets.item.past).toHaveLength(1);
    store.changeCell('item', row, 'item:D', 'A'); store.undo();
    store.changeCell('item', row, 'item:D', 'B');
    expect(useObjectTable.getState().sheets.item.future).toHaveLength(0);
  });
});
