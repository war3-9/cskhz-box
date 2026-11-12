import { beforeEach, expect, test } from 'vitest';
import { iconChoices, pathFill, resourcePath } from './paths';
import { initialSheets, MAX_ROWS } from '../model';
import { useObjectTable } from '../store';
const selection = (r1: number, r2 = r1, c1 = 2, c2 = c1) => ({ start: { row: r1, col: c1 }, end: { row: r2, col: c2 } });
beforeEach(() => useObjectTable.setState({ ...useObjectTable.getInitialState(), sheets: initialSheets() }, true));
test('pairs only matching bright images in the same directory and preserves names and extensions', () => {
  const entries = ['中文/BTN火.blp','中文/DISBTN火.blp','中文/DISBTN孤.blp','other/BTN孤.blp','icon.png','ICON.JPG','model.mdx'];
  const choices = iconChoices(entries.map(path => ({ path, model: false, size: 1, anonymous: false })));
  expect(choices.map(c => c.path)).not.toContain('中文/DISBTN火.blp');
  expect(choices.find(c => c.path === '中文/DISBTN孤.blp')?.error).toContain('缺少亮图');
  expect(choices.find(c => c.path === 'icon.png')?.error).toBeUndefined();
  expect(choices).toHaveLength(5);
  expect(resourcePath('中文/BTN火.blp','ReplaceableTextures/CommandButtons/')).toBe('ReplaceableTextures\\CommandButtons\\中文\\BTN火.blp');
  expect(resourcePath('Models/a.MDL')).toBe('Models\\a.MDL');
});
test('rejects filesystem paths and unsafe segments without guessing paths', () => {
  for (const p of ['C:/test.blp','../test.blp','/test.blp','a//b.blp','a/./b.blp','a\u0000.blp']) expect(() => resourcePath(p)).toThrow();
});
test('single cell expands down, counts overwritten cells and uses one undoable edit', () => {
  const store = useObjectTable.getState(); store.write('item', 0, 2, [['keep','untouched'],['old']]);
  const before = useObjectTable.getState().sheets.item, count = useObjectTable.getState().pastBooks.length;
  const fill = pathFill(before, selection(1), ['a.blp','b.blp','c.blp']);
  expect(fill.overwritten).toBe(1); expect(fill.range).toBe('D4:D6');
  store.write('item',fill.row,fill.col,fill.matrix);
  expect(useObjectTable.getState().pastBooks).toHaveLength(count + 1);
  const rows = useObjectTable.getState().sheets.item.rows;
  expect(rows.slice(1).map(r => r.cells['item:D'])).toEqual(['a.blp','b.blp','c.blp']);
  expect(rows[0].cells).toEqual(before.rows[0].cells);
  store.undo(); expect(useObjectTable.getState().sheets.item.rows).toEqual(before.rows);
  store.redo(); expect(useObjectTable.getState().sheets.item.rows[3].cells['item:D']).toBe('c.blp');
});
test('requires exact vertical count and blocks multiple columns and overflow', () => {
  const sheet = initialSheets().item;
  expect(() => pathFill(sheet,selection(0,2),['a'])).toThrow('相同数量');
  expect(pathFill(sheet,selection(2,0),['a','b','c']).row).toBe(0);
  expect(() => pathFill(sheet,selection(0,0,2,3),['a'])).toThrow('单列');
  expect(() => pathFill(sheet,selection(MAX_ROWS - 1),['a','b'])).toThrow('100000');
});
