import { beforeEach, describe, expect, it } from 'vitest';
import { isObjectDirty, useObjectTable } from './store';
import { currentProject, parseObjectProject, serializeObjectProject } from './project';
import { colorFields, colorRange, encodeColors, parseColors } from './dialogs/colorCodes';
import { templatesFor, templateTree } from './templates/catalog';
import { categories } from './schema';
import { spliceReferences } from './formulas/references';
beforeEach(() => useObjectTable.setState(useObjectTable.getInitialState(), true));
describe('列宽与原子行操作', () => {
  it('列宽独立保存、标记修改并撤销恢复保存基线', () => {
    const s = useObjectTable.getState(); expect(isObjectDirty(s)).toBe(false);
    s.resizeColumn('item', 'item:B', 219); expect(isObjectDirty(useObjectTable.getState())).toBe(true);
    const p = parseObjectProject(serializeObjectProject()); expect(p.sheets.item.columns[0].width).toBe(219);
    expect(p.sheets.unit.columns[0].width).toBe(120);
    s.undo(); expect(isObjectDirty(useObjectTable.getState())).toBe(false); s.redo();
    s.restore(p); expect(currentProject().sheets.item.columns[0].width).toBe(219); expect(isObjectDirty(useObjectTable.getState())).toBe(false);
    s.resizeColumn('item', 'item:B', 50000); expect(useObjectTable.getState().sheets.item.columns[0].width).toBe(4000);
  });
  it('2000行添加和区域删除只占一次历史，引用与辅助数据同时移动', () => {
    const s = useObjectTable.getState(); s.write('item', 0, 2, [['a'], ['b'], ['c'], ['d']]);
    s.write('unit', 0, 2, [["='物品'!$D$5"]]); const before = useObjectTable.getState().sheets;
    s.insertRows(1, 2000); expect(useObjectTable.getState().sheets.item.rows).toHaveLength(2004);
    expect(useObjectTable.getState().sheets.unit.rows[0].cells['unit:D']).toBe("='物品'!$D$2005");
    s.undo(); expect(useObjectTable.getState().sheets).toBe(before); s.redo(); s.removeRows(1, 2000);
    expect(useObjectTable.getState().sheets.item.rows.map(r => r.cells['item:D'])).toEqual(['a', 'b', 'c', 'd']);
    expect(useObjectTable.getState().sheets.unit.rows[0].cells['unit:D']).toBe("='物品'!$D$5");
    s.undo(); expect(useObjectTable.getState().sheets.item.rows).toHaveLength(2004);
    expect(() => s.insertRows(0, 2001)).toThrow();
  });
  it('删除范围保留部分交集，完全删除的引用报错', () => {
    const change = (formula: string) => spliceReferences(formula, ['物品'], ['物品'], 4, -3);
    expect(change('=SUM(D3:D8)')).toBe('=SUM(D3:D5)');
    expect(change('=SUM(D4:D5)')).toBe('=SUM(#REF!)');
    expect(change('=SUM(D4:D8)')).toBe('=SUM(D4:D5)');
    expect(change('=SUM(D3:D5)')).toBe('=SUM(D3:D3)');
    expect(change('=$D$6')).toBe('=#REF!');
    expect(change('=D7&"D6"')).toBe('=D4&"D6"');
  });
});
describe('文字颜色与原始物编ID目录', () => {
  it('颜色精确作用于选区，保留中文、换行、未知代码与非选中颜色', () => {
    const value = '|cffff0000红色|r普通|n下一行';
    expect(colorRange(value, 2, 4, 'ff00ff00')).toBe('|cffff0000红色|r|cff00ff00普通|r|n下一行');
    expect(colorRange(value, 0, 2)).toBe('红色普通|n下一行');
    expect(colorRange('猫😀\n狗', 0, 0, 'ffaabbcc')).toBe('|cffaabbcc猫😀|n狗|r');
    expect(parseColors('无效|cxyz|r|n<&>')).toEqual([{ text: '无效|cxyz', color: undefined }, { text: '\n', color: undefined }, { text: '<&>', color: undefined }]);
    expect(encodeColors(parseColors('|c8044AA00甲|r\n乙'))).toBe('|c8044aa00甲|r|n乙');
    expect([...colorFields]).toEqual(['name', 'description', 'tip', 'ubertip', 'editorname', 'bufftip']);
  });
  it('六类目录各自完整、可按中文与ID查找，分类树无漏项', () => {
    expect(categories.map(c => templatesFor(c.id).length)).toEqual([273, 836, 799, 89, 469, 245]);
    expect(templatesFor('unit', 'hfoo')[0]).toMatchObject({ id: 'hfoo', name: '步兵', folders: ['人族', '对战', '单位'] });
    expect(templatesFor('item', 'ratf')[0].folders).toEqual(['人造']);
    const tree = templateTree(templatesFor('unit'));
    const all = (nodes: typeof tree): number => nodes.reduce((n, node) => n + node.entries.length + all(node.children), 0);
    expect(all(tree)).toBe(836); expect(templatesFor('buff', 'hfoo')).toEqual([]);
  });
});
