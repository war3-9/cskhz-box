import { beforeEach, describe, expect, it } from 'vitest';
import { categories } from '../schema';
import { isObjectDirty, useObjectTable } from '../store';
import { parseObjectProject, serializeObjectProject } from '../project';
import { fillMatrix, seriesValues, type FillRule } from './series';

const column = { letter: 'H' }, idColumn = { letter: 'B' };
const values = (seed: string, operation: FillRule['operation'], operand: number, count = 3) => seriesValues([seed], count, { ...column, fill: { operation, operand } });
beforeEach(() => useObjectTable.setState(useObjectTable.getInitialState(), true));
describe('向下填充与列算法', () => {
  it('隐藏列保持原值且不执行其不适用的运算规则', () => {
    const s = useObjectTable.getState();
    s.write('unit', 0, 2, [['文字', '20', '=D3+E3'], ['777', '', ''], ['888', '', '']]);
    s.setFillRule('unit', 'unit:D', { operation: 'multiply', operand: 2 });
    const matrix = fillMatrix(useObjectTable.getState().sheets.unit, { start:{row:0,col:2}, end:{row:0,col:4} }, 2, new Set(['unit:D']));
    expect(matrix).toEqual([['777','21','=D4+E4'], ['888','22','=D5+E5']]);
  });
  it('编号保留前缀与补零并可推算两个起始值的步长', () => {
    expect(seriesValues(['f001'], 3, idColumn)).toEqual(['f002', 'f003', 'f004']);
    expect(seriesValues(['f009'], 2, idColumn)).toEqual(['f010', 'f011']);
    expect(seriesValues(['A098'], 3, idColumn)).toEqual(['A099', 'A100', 'A101']);
    expect(seriesValues(['f001', 'f003'], 2, idColumn)).toEqual(['f005', 'f007']);
    expect(seriesValues(['0001'], 2, idColumn)).toEqual(['0002', '0003']);
    expect(values('0001', 'add', 2)).toEqual(['0003', '0005', '0007']);
    expect(seriesValues(['敌人009'], 2, column)).toEqual(['敌人010', '敌人011']);
  });
  it('自定义分类中的 B 列按普通文本填充，不套用 Warcraft ID 校验', () => {
    expect(seriesValues(['自定义009'], 2, idColumn, false)).toEqual(['自定义010', '自定义011']);
  });
  it('数字自动递增、保留负数小数并推算步长', () => {
    expect(seriesValues(['10'], 3, column)).toEqual(['11', '12', '13']);
    expect(seriesValues(['10', '15'], 3, column)).toEqual(['20', '25', '30']);
    expect(seriesValues(['3', '1'], 3, column)).toEqual(['-1', '-3', '-5']);
    expect(seriesValues(['0.1', '0.2'], 3, column)).toEqual(['0.3', '0.4', '0.5']);
    expect(seriesValues(['9007199254740990'], 1, column)).toEqual(['9007199254740991']);
  });
  it('支持加减乘除，倍增按首格反复计算而不是每行固定结果', () => {
    expect(values('10', 'add', 5)).toEqual(['15', '20', '25']);
    expect(values('10', 'subtract', 3)).toEqual(['7', '4', '1']);
    expect(values('10', 'multiply', 2)).toEqual(['20', '40', '80']);
    expect(values('10', 'multiply', 1.5)).toEqual(['15', '22.5', '33.75']);
    expect(values('0.1', 'multiply', 1.5)).toEqual(['0.15', '0.225', '0.3375']);
    expect(values('100', 'divide', 2)).toEqual(['50', '25', '12.5']);
    expect(values('-3', 'multiply', -2)).toEqual(['6', '-12', '24']);
    expect(values('0.1', 'add', 0.1)).toEqual(['0.2', '0.3', '0.4']);
    expect(values('f001', 'add', 2)).toEqual(['f003', 'f005', 'f007']);
    expect(seriesValues(['10', '20'], 2, { ...column, fill: { operation: 'multiply', operand: 2 } })).toEqual(['40', '80']);
  });
  it('普通文字复制，公式跟随相对引用并保留绝对引用', () => {
    expect(seriesValues(['步兵'], 2, column)).toEqual(['步兵', '步兵']);
    expect(seriesValues([''], 2, column)).toEqual(['', '']);
    expect(seriesValues(['=D3+$H$3'], 2, column)).toEqual(['=D4+$H$3', '=D5+$H$3']);
    expect(values('=D3', 'copy', 1)).toEqual(['=D3', '=D3', '=D3']);
    expect(seriesValues(['甲', '乙'], 3, column)).toEqual(['甲', '乙', '甲']);
  });
  it('拒绝除零、非数字运算、不完整ID、小数编号和数值溢出', () => {
    expect(() => values('10', 'divide', 0)).toThrow('除数不能');
    expect(() => values('步兵', 'add', 1)).toThrow('首格必须');
    expect(() => values('10', 'add', Infinity)).toThrow('有效');
    expect(() => seriesValues(['f999'], 1, idColumn)).toThrow('4 位');
    expect(() => values('f001', 'add', 0.5)).toThrow('非负安全整数');
    expect(() => values('100000', 'multiply', 1000, 20)).toThrow('安全数值');
  });
  it('混合列各用独立算法，填充一次写入且一次撤销重做', () => {
    const s = useObjectTable.getState();
    s.write('unit', 0, 0, [['f001', 'hfoo', '步兵', '', '', '', '10']]);
    s.setFillRule('unit', 'unit:H', { operation: 'multiply', operand: 2 });
    const before = useObjectTable.getState(), selection = { start: { row: 0, col: 0 }, end: { row: 0, col: 6 } };
    const matrix = fillMatrix(before.sheets.unit, selection, 3);
    expect(matrix.map(r => [r[0], r[1], r[2], r[6]])).toEqual([['f002', 'hfoo', '步兵', '20'], ['f003', 'hfoo', '步兵', '40'], ['f004', 'hfoo', '步兵', '80']]);
    s.write('unit', 1, 0, matrix);
    expect(useObjectTable.getState().pastBooks).toHaveLength(before.pastBooks.length + 1);
    s.undo(); expect(useObjectTable.getState().sheets).toBe(before.sheets);
    s.redo(); expect(useObjectTable.getState().sheets.unit.rows[3].cells['unit:H']).toBe('80');
  });
  it('失败不写入任何列，并限制填充范围', () => {
    const s = useObjectTable.getState(); s.write('unit', 0, 0, [['f001', 'hfoo', '', '', '', '', '10']]);
    s.setFillRule('unit', 'unit:C', { operation: 'add', operand: 1 });
    const before = useObjectTable.getState(), selection = { start: { row: 0, col: 0 }, end: { row: 0, col: 6 } };
    expect(() => fillMatrix(before.sheets.unit, selection, 3)).toThrow('首格必须');
    expect(useObjectTable.getState().sheets).toBe(before.sheets);
    expect(() => fillMatrix(before.sheets.unit, selection, 100000)).toThrow('拖动填充范围');
    expect(() => fillMatrix(before.sheets.unit, selection, 40000)).toThrow('20 万格');
  });
  it('六类每列规则独立，支持保存恢复、撤销重做及旧工作簿', () => {
    const s = useObjectTable.getState();
    for (const c of categories) s.setFillRule(c.id, `${c.id}:B`, { operation: 'add', operand: 2 });
    expect(isObjectDirty(useObjectTable.getState())).toBe(true);
    const p = parseObjectProject(serializeObjectProject()); s.restore(p);
    for (const c of categories) expect(useObjectTable.getState().sheets[c.id].columns[0].fill).toEqual({ operation: 'add', operand: 2 });
    expect(isObjectDirty(useObjectTable.getState())).toBe(false);
    s.setFillRule('unit', 'unit:H', { operation: 'multiply', operand: 2 }); s.undo();
    expect(isObjectDirty(useObjectTable.getState())).toBe(false); s.redo();
    expect(useObjectTable.getState().sheets.unit.columns[6].fill?.operation).toBe('multiply');
    const legacy = p; for (const c of categories) for (const col of legacy.sheets[c.id].columns) delete col.fill;
    expect(parseObjectProject(JSON.stringify(legacy)).sheets.unit.columns[0].fill).toBeUndefined();
  });
  it('无效的保存规则不能绕过导入校验', () => {
    const data = JSON.parse(serializeObjectProject()); data.sheets.item.columns[0].fill = { operation: 'divide', operand: 0 };
    expect(() => parseObjectProject(JSON.stringify(data))).toThrow('除数不能');
  });
});
