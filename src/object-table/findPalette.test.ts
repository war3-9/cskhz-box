import { beforeEach, describe, expect, it } from 'vitest';
import { findObjectMatches } from './find';
import { applyPaletteDraft, paletteTarget } from './palette/model';
import { useObjectTable } from './store';
import { currentProject } from './project';
import { categories } from './schema';
import { templatesFor } from './templates/catalog';

beforeEach(() => useObjectTable.setState(useObjectTable.getInitialState(), true));
describe('查找、替换和悬浮色板绑定', () => {
  it('查找范围独立，按列和行顺序循环定位且忽略大小写', () => {
    const s = useObjectTable.getState(); s.write('item', 0, 2, [['FixtureText'], ['FIXTURETEXT']]);
    const sheet = useObjectTable.getState().sheets.item;
    expect(findObjectMatches(sheet, 'fixturetext', 'cells')).toEqual([{ kind: 'cell', row: 0, col: 2 }, { kind: 'cell', row: 1, col: 2 }]);
    expect(findObjectMatches(sheet, '名字', 'columns')[0]).toMatchObject({ kind: 'column', col: 2 });
    expect(findObjectMatches(sheet, '', 'all')).toEqual([]);
  });
  it('批量替换保留ID，只产生一次撤销，按字面替换公式和文本', () => {
    const s = useObjectTable.getState(); s.write('item', 0, 0, [['abc', 'ratf', 'abcabc'], ['', '', '=D3&"abc"']]);
    const before = useObjectTable.getState().sheets;
    expect(s.replaceAll('item', 'abc', '$&')).toBe(2);
    expect(useObjectTable.getState().sheets.item.rows[0].cells).toMatchObject({ 'item:B': 'abc', 'item:D': '$&$&' });
    expect(useObjectTable.getState().sheets.item.rows[1].cells['item:D']).toBe('=D3&"$&"');
    s.undo(); expect(useObjectTable.getState().sheets).toBe(before);
  });
  it('色板跟随原行，插行及切换分类后仍只写原单元格，保存可撤销', () => {
    const s = useObjectTable.getState(), unitRows = s.sheets.unit.rows; s.write('item', 0, 2, [['原文']]);
    const target = paletteTarget('item', 0, 2); s.insertRows(0, 2); s.activate('unit');
    const applied = applyPaletteDraft({ target, value: '|cffff0000新文|r' });
    expect(applied.row).toBe(2); expect(useObjectTable.getState().sheets.item.rows[2].cells['item:D']).toBe('|cffff0000新文|r');
    expect(useObjectTable.getState().sheets.unit.rows).toBe(unitRows); s.undo();
    expect(useObjectTable.getState().sheets.item.rows[2].cells['item:D']).toBe('原文');
  });
  it('删除原行、其他编辑及更换工作簿均拒绝覆盖', () => {
    const s = useObjectTable.getState(); s.write('item', 0, 2, [['原文']]); const target = paletteTarget('item', 0, 2);
    s.write('item', 0, 2, [['表格修改']]); expect(() => applyPaletteDraft({ target, value: '草稿' })).toThrow('已在表格中修改');
    s.removeRows(0, 0); expect(() => applyPaletteDraft({ target, value: '草稿' })).toThrow('已删除');
    s.restore(currentProject()); expect(() => applyPaletteDraft({ target, value: '草稿' })).toThrow('工作簿已更换');
  });
  it('目录每项有独立图标元数据，单位和物品都有内置图标', () => {
    for (const category of categories) for (const entry of templatesFor(category.id)) { expect(typeof entry.art).toBe('string'); expect(typeof entry.bundled).toBe('boolean'); }
    expect(templatesFor('unit', 'hfoo')[0]).toMatchObject({ bundled: true });
    expect(templatesFor('item', 'ratf')[0]).toMatchObject({ bundled: true });
  });
});
