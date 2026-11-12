import { describe, expect, it } from 'vitest';
import { createCalculator } from './engine';
import { rebaseImportedColumns, shiftFormula, spliceReferences } from './references';
import { initialSheets } from '../model';
import { useObjectTable } from '../store';
describe('公式计算与复制', () => {
  it('导入首列布局时移动相对和绝对列引用，未关联公式保持原文', () => {
    const shifted = new Set(['物品']);
    expect(rebaseImportedColumns('=A3&$B$3', '物品', shifted)).toBe('=B3&$C$3');
    expect(rebaseImportedColumns("='物品'!A3+'单位'!$B$3", '单位', shifted)).toBe("='物品'!B3+'单位'!$B$3");
    expect(rebaseImportedColumns("=SUM('单位'!A3) + 1", '单位', shifted)).toBe("=SUM('单位'!A3) + 1");
  });
  it('保留绝对/相对引用、中文表名、文本引号和函数结构', () => {
    expect(shiftFormula('=SUM(D3,$E3,F$3,$G$3)&"a""b"', 2, 1)).toBe('=SUM(E5,$E5,G$3,$G$3)&"a""b"');
    expect(shiftFormula("='魔法效果'!$D3&D3", 1, 2)).toBe("='魔法效果'!$D4&F4");
    expect(shiftFormula('=A1', -1, 0)).toBe('=#REF!');
    expect(shiftFormula('=d3+$e4', 1, 2)).toBe('=F4+$E5');
    expect(spliceReferences('=SUM(D3:D5)', ['物品'], ['物品'], 3, -1)).toBe('=SUM(D3:D4)');
    expect(spliceReferences('=SUM(D3:D5)', ['物品'], ['物品'], 5, -1)).toBe('=SUM(D3:D4)');
  });
  it('计算依赖、算术、拼接、范围函数及跨页引用，更新后不使用旧缓存', () => {
    const sheets = initialSheets();
    sheets.item.rows = [{ id: '1', cells: { 'item:D': '12', 'item:E': '=D3*2+SUM(1,2)', 'item:F': '=IF(E3>20,"胜利","失败")&"!"' } }];
    sheets.unit.rows = [{ id: '2', cells: { 'unit:D': "='物品'!E3+1" } }];
    let calc = createCalculator(sheets);
    expect(calc.read('item', 3, 5).text).toBe('27'); expect(calc.read('item', 3, 6).text).toBe('胜利!');
    expect(calc.read('unit', 3, 4).text).toBe('28');
    sheets.item.rows[0].cells['item:D'] = '2'; calc = createCalculator(sheets);
    expect(calc.read('unit', 3, 4).text).toBe('8');
  });
  it('循环、缺页、不支持的公式明确报错', () => {
    for (const formula of ['=D3', "='辅助页'!D3", '=UNKNOWN_FN(1)', '=1/0']) {
      const sheets = initialSheets(); sheets.item.rows = [{ id: '1', cells: { 'item:D': formula } }];
      expect(createCalculator(sheets).read('item', 3, 4).error, formula).toBeTruthy();
    }
  });
  it('复用解析器后错误不污染后续公式，嵌套跨页计算不互相覆盖', () => {
    const sheets = initialSheets();
    sheets.item.rows = [{ id: 'i', cells: { 'item:D': '=SUM(1,', 'item:E': '=SUM(1,2)', 'item:F': "=SUM('单位'!D3:E3)+E3*2", 'item:G': '=F3+SUM(7,8)' } }];
    sheets.unit.rows = [{ id: 'u', cells: { 'unit:D': '=SUM(4,5)', 'unit:E': "='物品'!E3*2", 'unit:F': '=D3+E3' } }];
    const calc = createCalculator(sheets);
    expect(calc.read('item', 3, 4).error).toBeTruthy();
    expect(calc.read('item', 3, 5).text).toBe('3');
    expect(calc.read('item', 3, 7).text).toBe('36');
    expect(calc.read('unit', 3, 6).text).toBe('15');
    expect(calc.read('item', 3, 4).error).toBeTruthy();
  });
  it('引用空白单元格显示零，空字符串公式保持空字符串', () => {
    const sheets = initialSheets(); sheets.item.rows = [{ id: '1', cells: { 'item:D': '=Z99', 'item:E': '=""' } }];
    const calc = createCalculator(sheets); expect(calc.read('item', 3, 4).text).toBe('0'); expect(calc.read('item', 3, 5).text).toBe(''); expect(calc.read('item', 99, 26).text).toBe('');
  });
  it('插入/删除移动跨表引用，撤销一次恢复整个结构操作', () => {
    useObjectTable.setState(useObjectTable.getInitialState(), true);
    const store = useObjectTable.getState();
    store.write('item', 0, 0, [['i1', 'ratf', '10'], ['i2', 'ratf', '=D3*2']]);
    store.write('unit', 0, 2, [["='物品'!$D$4"]]);
    store.insertRow(0);
    expect(useObjectTable.getState().sheets.unit.rows[0].cells['unit:D']).toBe("='物品'!$D$5");
    expect(useObjectTable.getState().sheets.item.rows[2].cells['item:D']).toBe('=D4*2');
    store.undo(); expect(useObjectTable.getState().sheets.unit.rows[0].cells['unit:D']).toBe("='物品'!$D$4");
    store.redo(); const row = useObjectTable.getState().sheets.item.rows[1]; store.removeRow(row.id);
    expect(useObjectTable.getState().sheets.item.rows[1].cells['item:D']).toContain('#REF!');
  });
});
