import { describe, expect, it } from 'vitest';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { importExcel } from './read';
import { createCalculator } from '../formulas/engine';
import { parseObjectProject } from '../project';
import { generateMacros } from '../export';
async function fixture(xml: string, shared?: string, name = '自定义物品') {
  const zip = new ZipWriter(new BlobWriter());
  await zip.add('xl/workbook.xml', new TextReader(`<workbook><sheets><sheet name="${name}" r:id="rId1"/></sheets></workbook>`));
  await zip.add('xl/_rels/workbook.xml.rels', new TextReader('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'));
  if (shared) await zip.add('xl/sharedStrings.xml', new TextReader(shared));
  await zip.add('xl/worksheets/sheet1.xml', new TextReader(xml)); return zip.close();
}
describe('流式 Excel 导入', () => {
  it('首列直接放 ID 时识别标准物编页，不再误判成重名自定义页', async () => {
    const xml = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>自定义ID</t></is></c><c r="B1" t="inlineStr"><is><t>模板</t></is></c><c r="C1" t="inlineStr"><is><t>名字</t></is></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>留空则自动生成ID</t></is></c><c r="B2" t="inlineStr"><is><t>item</t></is></c><c r="C2" t="inlineStr"><is><t>Name</t></is></c></row>
      <row r="3"><c r="A3" t="inlineStr"><is><t>I000</t></is></c><c r="B3" t="inlineStr"><is><t>soul</t></is></c><c r="C3"><f>A3&amp;"-"&amp;$B$3</f><v>cached</v></c></row>
      </sheetData></worksheet>`;
    const p = parseObjectProject(JSON.stringify(await importExcel(await fixture(xml, undefined, '物品'))));
    expect(p.customSheets).toEqual({});
    expect(p.sheets.item.columns.slice(0, 3).map(column => [column.letter, column.title, column.field])).toEqual([
      ['B', '自定义ID', '留空则自动生成ID'], ['C', '模板', 'item'], ['D', '名字', 'Name'],
    ]);
    expect(p.sheets.item.rows[0].cells).toMatchObject({ 'item:B': 'I000', 'item:C': 'soul', 'item:D': '=B3&"-"&$C$3' });
    expect(createCalculator(p.sheets).read('item', 3, 4).text).toBe('I000-soul');
    expect(generateMacros(p, ['item'])[0].text).toContain("OBJ.Name = 'I000-soul'");
  });
  it('混合列布局时重定位指向已移动工作表的跨页公式', async () => {
    const zip = new ZipWriter(new BlobWriter());
    await zip.add('xl/workbook.xml', new TextReader('<workbook><sheets><sheet name="物品" r:id="rId1"/><sheet name="单位" r:id="rId2"/></sheets></workbook>'));
    await zip.add('xl/_rels/workbook.xml.rels', new TextReader('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'));
    await zip.add('xl/worksheets/sheet1.xml', new TextReader('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>自定义ID</t></is></c><c r="B1" t="inlineStr"><is><t>模板</t></is></c><c r="C1" t="inlineStr"><is><t>名字</t></is></c></row><row r="2"><c r="B2" t="inlineStr"><is><t>item</t></is></c><c r="C2" t="inlineStr"><is><t>Name</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>I000</t></is></c><c r="B3" t="inlineStr"><is><t>soul</t></is></c></row></sheetData></worksheet>'));
    await zip.add('xl/worksheets/sheet2.xml', new TextReader('<worksheet><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>自定义ID</t></is></c><c r="C1" t="inlineStr"><is><t>模板</t></is></c><c r="D1" t="inlineStr"><is><t>名字</t></is></c></row><row r="2"><c r="C2" t="inlineStr"><is><t>unit</t></is></c><c r="D2" t="inlineStr"><is><t>Name</t></is></c></row><row r="3"><c r="B3" t="inlineStr"><is><t>u000</t></is></c><c r="C3" t="inlineStr"><is><t>hfoo</t></is></c><c r="D3"><f>\'物品\'!A3&amp;"-"&amp;\'物品\'!$B$3</f></c></row></sheetData></worksheet>'));
    const p = parseObjectProject(JSON.stringify(await importExcel(await zip.close())));
    expect(p.sheets.unit.rows[0].cells['unit:D']).toBe('=\'物品\'!B3&"-"&\'物品\'!$C$3');
    expect(createCalculator(p.sheets).read('unit', 3, 4).text).toBe('I000-soul');
  });
  it('识别 C2、忽略 A1 数量、实际字段重排/重复、空白行和共享公式', async () => {
    const blob = await fixture(`<worksheet><sheetData>
      <row r="1"><c r="A1"><v>999</v></c><c r="B1" t="inlineStr"><is><t>ID</t></is></c><c r="C1" t="inlineStr"><is><t>模板</t></is></c><c r="D1" t="inlineStr"><is><t>名字</t></is></c><c r="E1" t="inlineStr"><is><t>名字副本</t></is></c></row>
      <row r="2"><c r="C2" t="inlineStr"><is><t>item</t></is></c><c r="D2" t="inlineStr"><is><t>Name</t></is></c><c r="E2" t="inlineStr"><is><t>Name</t></is></c></row>
      <row r="3"><c r="C3" t="inlineStr"><is><t>ratf</t></is></c><c r="D3"><v>7</v></c><c r="E3"><f t="shared" si="0" ref="E3:E5">D3*2</f><v>999</v></c></row>
      <row r="4"><c r="E4"><f t="shared" si="0"/><v>999</v></c></row>
      <row r="5"><c r="D5"><v>9</v></c><c r="E5"><f t="shared" si="0"/></c></row>
      <row r="1048576"><c r="D1048576" s="8"/><c r="E1048576" t="s" s="8"/></row>
      </sheetData></worksheet>`);
    const p = await importExcel(blob);
    expect(p.sheets.item.columns.map(c => c.field)).toEqual(['', 'item', 'Name', 'Name']);
    expect(p.sheets.item.rows).toHaveLength(3); expect(p.sheets.item.rows[1].cells['item:E']).toBe('=D4*2');
    expect(createCalculator(p.sheets).read('item', 3, 5).text).toBe('14');
    expect(createCalculator(p.sheets).read('item', 5, 5).text).toBe('18');
  });
  it('未知工作表按原始行列位置导入为本地分类', async () => {
    const imported = await importExcel(await fixture('<worksheet><sheetData><row r="1"><c r="B1"><v>2210</v></c><c r="C1" t="str"><f>REPLACE(B1,1,1,ROW(A1))</f><v>set udg_test[1] = \'g001\'</v></c></row></sheetData></worksheet>'));
    const p = parseObjectProject(JSON.stringify(imported));
    expect(p.active).toBe('custom-1');
    expect(p.customSheets?.['custom-1']).toMatchObject({ name: '自定义物品', columns: [{ letter: 'B' }, { letter: 'C' }], rows: [{ cells: { 'custom-1:B': '2210', 'custom-1:C': "set udg_test[1] = 'g001'" } }] });
    expect(Object.keys(p.sheets)).toEqual(['item', 'unit', 'ability', 'upgrade', 'doodad', 'buff']);
  });
  it('自定义工作表显示 Excel 缓存的公式结果，公式不进入物编公式引擎', async () => {
    const p = await importExcel(await fixture('<worksheet><sheetData><row r="1"><c r="A1" t="str"><f>PHONETIC(A1:A34)</f><v>缓存的显示值</v></c><c r="B1"><f>UNSUPPORTED(A1)</f></c><c r="C1"><f t="array" ref="C1:C2"/><v>数组结果</v></c></row></sheetData></worksheet>'));
    const sheet = p.customSheets?.['custom-1'];
    expect(sheet?.rows[0].cells['custom-1:A']).toBe('缓存的显示值');
    expect(sheet?.rows[0].cells['custom-1:B']).toBe("'=UNSUPPORTED(A1)");
    expect(sheet?.rows[0].cells['custom-1:C']).toBe('数组结果');
    expect(createCalculator({ ...p.sheets, ...p.customSheets }).read('custom-1', 3, 1).text).toBe('缓存的显示值');
  });
  it('没有任何有内容的工作表时给出明确错误', async () => {
    await expect(importExcel(await fixture('<worksheet><sheetData><row r="2"><c r="C2" s="1"/></row></sheetData></worksheet>'))).rejects.toThrow('Excel 中没有可导入的表格内容');
  });
  it('共享文本、富文本和 Excel 转义保留为文本，文本等号不执行', async () => {
    const p = await importExcel(await fixture('<worksheet><sheetData><row r="2"><c r="C2" t="s"><v>0</v></c><c r="D2" t="s"><v>1</v></c></row><row r="3"><c r="D3" t="s"><v>2</v></c></row></sheetData></worksheet>', '<sst><si><t>item</t></si><si><t>Name</t></si><si><r><t>=D3</t></r><r><t>_x000D_第二行_x005F_x0041_</t></r></si></sst>'));
    expect(createCalculator(p.sheets).read('item', 3, 4).text).toBe('=D3\r第二行_x0041_');
    expect(p.sheets.item.rows[0].cells['item:D']).toBe("'=D3\r第二行_x0041_");
    expect(p.sheets.item.columns[0].field).toBe('');
  });
});
