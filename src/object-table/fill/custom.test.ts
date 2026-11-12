import { beforeEach, describe, expect, it } from 'vitest';
import { customTarget, customValue, readCustomNumber } from './custom';
import { fillMatrix, seriesValues, validateFillRule, type FillRule } from './series';
import { currentProject, parseObjectProject, serializeObjectProject } from '../project';
import { isObjectDirty, useObjectTable } from '../store';
import type { ArithmeticOperation } from './arithmetic';
import { generateMacros } from '../export';

const path = String.raw`war3mapImported\SH_MoFa_1.mdx`;
function rule(seed: string, selected: string, operator: ArithmeticOperation = 'add', operand = 1): FillRule {
  const start = seed.indexOf(selected);
  return { operation: 'custom', operand, custom: customTarget(seed, start, start + selected.length, operator) };
}
const values = (seed: string, selected: string, operator: ArithmeticOperation = 'add', operand = 1) => seriesValues([seed], 3, { letter: 'D', fill: rule(seed, selected, operator, operand) });
beforeEach(() => useObjectTable.setState(useObjectTable.getInitialState(), true));
describe('自定义指定字符串中的数字', () => {
  it('只计算模型路径中选中的数字，保留反斜杠、扩展名及中文', () => {
    expect(values(path, '1')).toEqual([2, 3, 4].map(n => path.replace('_1.', `_${n}.`)));
    const seed = String.raw`war3mapImported\中文 伤害_001_v2.mdx`;
    expect(values(seed, '001')).toEqual(['002', '003', '004'].map(n => seed.replace('001', n)));
  });
  it('多个相同数字时按选择位置区分，可选择数字的一部分', () => {
    const seed = 'SH_001_001_v2.mdx', start = seed.lastIndexOf('001');
    const fill: FillRule = { operation: 'custom', operand: 1, custom: customTarget(seed, start, start + 3, 'add') };
    expect(seriesValues([seed], 2, { letter: 'D', fill })).toEqual(['SH_001_002_v2.mdx', 'SH_001_003_v2.mdx']);
    expect(values('year2026_file12345.mdx', '234')).toEqual(['year2026_file12355.mdx', 'year2026_file12365.mdx', 'year2026_file12375.mdx']);
  });
  it('支持小数倍率、除法、负数及小数步长，不出现浮点尾数', () => {
    expect(values('伤害_10_版本2', '10', 'multiply', 1.5)).toEqual(['伤害_15_版本2', '伤害_22.5_版本2', '伤害_33.75_版本2']);
    expect(values('伤害_100.mdx', '100', 'divide', 2)).toEqual(['伤害_50.mdx', '伤害_25.mdx', '伤害_12.5.mdx']);
    expect(values('value=-3/end', '-3', 'multiply', -2)).toEqual(['value=6/end', 'value=-12/end', 'value=24/end']);
    expect(values('伤害_0.1/end', '0.1', 'add', 0.1)).toEqual(['伤害_0.2/end', '伤害_0.3/end', '伤害_0.4/end']);
    expect(values('value=10/end', '10', 'subtract', 4)).toEqual(['value=6/end', 'value=2/end', 'value=-2/end']);
  });
  it('补零跨位数、负数和小数结果都保持指定格式', () => {
    expect(values('SH_009_v2.mdx', '009')).toEqual(['SH_010_v2.mdx', 'SH_011_v2.mdx', 'SH_012_v2.mdx']);
    expect(values('SH_999_v2.mdx', '999')).toEqual(['SH_1000_v2.mdx', 'SH_1001_v2.mdx', 'SH_1002_v2.mdx']);
    expect(values('SH_001_v2.mdx', '001', 'subtract', 2)).toEqual(['SH_-001_v2.mdx', 'SH_-003_v2.mdx', 'SH_-005_v2.mdx']);
    expect(values('SH_001_v2.mdx', '001', 'multiply', 1.5)).toEqual(['SH_001.5_v2.mdx', 'SH_002.25_v2.mdx', 'SH_003.375_v2.mdx']);
    expect(values('SH_+001/end', '+001')).toEqual(['SH_+002/end', 'SH_+003/end', 'SH_+004/end']);
  });
  it('从当前首格读数，数字变长后仍能继续使用同一规则', () => {
    const fill = rule('SH_9_v2.mdx', '9');
    expect(seriesValues(['SH_10_v2.mdx'], 2, { letter: 'D', fill })).toEqual(['SH_11_v2.mdx', 'SH_12_v2.mdx']);
    expect(seriesValues(['SH_9_v2.mdx', 'SH_10_v2.mdx'], 2, { letter: 'D', fill })).toEqual(['SH_11_v2.mdx', 'SH_12_v2.mdx']);
    expect(() => seriesValues(['OTHER_10_v2.mdx'], 2, { letter: 'D', fill })).toThrow('重新选取');
  });
  it('空选择、非数字、跨多段、除零和安全数值越界会被拒绝', () => {
    expect(() => customTarget(path, 0, 0, 'add')).toThrow('选中');
    expect(() => customTarget(path, -1, 2, 'add')).toThrow('选中');
    expect(() => customTarget(path, 0, path.length + 1, 'add')).toThrow('选中');
    expect(() => rule(path, 'MoFa')).toThrow('一段数字');
    expect(() => rule('SH_1_v2.mdx', '1_v2')).toThrow('一段数字');
    expect(() => validateFillRule(rule(path, '1', 'divide', 0))).toThrow('除数不能');
    expect(() => validateFillRule({ operation: 'custom', operand: 1 })).toThrow('选中');
    expect(() => rule('SH_9007199254740992.mdx', '9007199254740992')).toThrow('安全数值');
    expect(() => values('SH_100000/end', '100000', 'multiply', 1e20)).toThrow('安全数值');
    expect(() => seriesValues(['f999'], 1, { letter: 'B', fill: rule('f999', '999') })).toThrow('4 位');
  });
  it('选中整格数字也可计算，指数结果可以作为下次计算的首格', () => {
    expect(values('10', '10', 'multiply', 1.5)).toEqual(['15', '22.5', '33.75']);
    const target = customTarget('v0.000001/end', 1, 9, 'divide');
    const next = customValue('v0.000001/end', target, 10, 1);
    expect(Number(readCustomNumber(next, target))).toBe(1e-7);
  });
  it('规则保存恢复、按列独立，换数字位置也产生一次可撤销修改', () => {
    const seed = 'SH_2026_001_v2.mdx', s = useObjectTable.getState();
    s.setFillRule('unit', 'unit:D', rule(seed, '001'));
    const saved = parseObjectProject(serializeObjectProject()); s.restore(saved);
    expect(useObjectTable.getState().sheets.unit.columns[2].fill).toEqual(rule(seed, '001'));
    expect(useObjectTable.getState().sheets.item.columns[2].fill).toBeUndefined();
    expect(isObjectDirty(useObjectTable.getState())).toBe(false);
    s.setFillRule('unit', 'unit:D', rule(seed, '2026'));
    expect(isObjectDirty(useObjectTable.getState())).toBe(true);
    s.undo(); expect(useObjectTable.getState().sheets.unit.columns[2].fill).toEqual(rule(seed, '001'));
    s.redo(); expect(useObjectTable.getState().sheets.unit.columns[2].fill).toEqual(rule(seed, '2026'));
    const input = rule(seed, '001'); s.setFillRule('unit', 'unit:D', input); input.custom!.prefix = 'changed';
    expect(useObjectTable.getState().sheets.unit.columns[2].fill?.custom?.prefix).toBe('SH_2026_');
  });
  it('缺失或损坏的自定义规则在导入时被拒绝', () => {
    const p = JSON.parse(serializeObjectProject());
    p.sheets.unit.columns[2].fill = { operation: 'custom', operand: 1 };
    expect(() => parseObjectProject(JSON.stringify(p))).toThrow('选中');
    p.sheets.unit.columns[2].fill = rule(path, '1', 'divide', 0);
    expect(() => parseObjectProject(JSON.stringify(p))).toThrow('除数不能');
    p.sheets.unit.columns[2].fill.custom.prefix = 123;
    expect(() => parseObjectProject(JSON.stringify(p))).toThrow();
  });
  it('混合列填充一次撤销重做，导出使用计算后的完整路径', () => {
    const s = useObjectTable.getState(); const fileCol = s.sheets.unit.columns.findIndex(c => c.field.toLowerCase() === 'file');
    expect(fileCol).toBeGreaterThan(1);
    s.write('unit', 0, 0, [['f001', 'hfoo']]); s.write('unit', 0, fileCol, [[path]]);
    s.setFillRule('unit', s.sheets.unit.columns[fileCol].key, rule(path, '1'));
    const before = useObjectTable.getState().sheets;
    const matrix = fillMatrix(before.unit, { start: { row: 0, col: 0 }, end: { row: 0, col: fileCol } }, 3);
    s.write('unit', 1, 0, matrix); const filled = useObjectTable.getState().sheets;
    expect(filled.unit.rows[3].cells[filled.unit.columns[fileCol].key]).toBe(path.replace('_1.', '_4.'));
    const exported = generateMacros(currentProject(), ['unit'])[0].text;
    expect(exported).toContain("OBJ.file = 'war3mapImported\\\\SH_MoFa_4.mdx'");
    s.undo(); expect(useObjectTable.getState().sheets).toBe(before); s.redo(); expect(useObjectTable.getState().sheets).toBe(filled);
  });
});
