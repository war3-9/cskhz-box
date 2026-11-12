import { describe, expect, it } from 'vitest';
import { generateMacros, allCategoryIds } from './export';
import { initialSheets, dataOnly, initialViews, type ObjectProject } from './model';
const project = (): ObjectProject => ({ format: 'war3-objects', version: 1, active: 'item', sheets: dataOnly(initialSheets()), views: initialViews() });
describe('六类原宏导出', () => {
  it('独立文件、原始行自动 ID、清空/零值、重复字段赋值和 UTF8/CRLF', () => {
    const p = project();
    p.sheets.item.rows = [{ id: 'gap', cells: {} }, { id: 'x', cells: { 'item:C': 'ratf', 'item:D': "猫's\\武器\n第二行", 'item:E': '#', 'item:F': '0' } }];
    const files = generateMacros(p, allCategoryIds);
    expect(files.map(f => f.name)).toEqual(allCategoryIds.map(id => `Xm_${id}.lua`));
    expect(files[0].count).toBe(1); expect(files[0].text).toContain("SLK.item.ratf:new('XG_item2')");
    expect(files[0].text).toContain("猫\\'s\\\\武器\\n第二行"); expect(files[0].text).toContain(" = ''"); expect(files[0].text).toContain(" = '0'");
    expect(files[0].text.charCodeAt(0)).toBe(0xfeff); expect(files[0].text.replaceAll('\r\n', '')).not.toContain('\n');
    const duplicates = p.sheets.ability.columns.filter(c => c.field === 'DataD1');
    p.sheets.ability.rows = [{ id: 'a', cells: { 'ability:C': 'AHbz', [duplicates[0].key]: 'first', [duplicates[1].key]: 'second' } }];
    const text = generateMacros(p, ['ability'])[0].text;
    expect(text.indexOf("OBJ.DataD1 = 'first'")).toBeLessThan(text.indexOf("OBJ.DataD1 = 'second'"));
  });
  it('缺少模板、重复 ID、公式错误阻止导出并提供定位', () => {
    const p = project(); p.sheets.item.rows = [{ id: '1', cells: { 'item:D': '名' } }];
    expect(() => generateMacros(p, ['item'])).toThrow('C3');
    p.sheets.item.rows = [{ id: '1', cells: { 'item:B': 'i001', 'item:C': 'ratf' } }, { id: '2', cells: { 'item:B': 'i001', 'item:C': 'ratf' } }];
    expect(() => generateMacros(p, ['item'])).toThrow('重复 ID');
    p.sheets.item.rows[1].cells = { 'item:C': 'ratf', 'item:D': '=D4' };
    expect(() => generateMacros(p, ['item'])).toThrow('D4');
  });
  it('留白跳过赋值，空值明确写入，转义和公式结果中的 # 保留原文', () => {
    for (const [raw, value] of [['#', ''], ['无', ''], ["'", ''], ['=""', ''], ["'#", '#'], ["'无", '无'], ['="#"', '#'], ['="无"', '无'], ['0', '0']]) {
      const p = project(); p.sheets.item.rows = [{ id: '1', cells: { 'item:C': 'ratf', 'item:D': raw } }];
      expect(generateMacros(p, ['item'])[0].text).toContain(`OBJ.Name = '${value}'`);
    }
    const p = project(); p.sheets.item.rows = [{ id: '1', cells: { 'item:C': 'ratf', 'item:D': '' } }];
    expect(generateMacros(p, ['item'])[0].text).not.toContain('OBJ.Name =');
  });
});
