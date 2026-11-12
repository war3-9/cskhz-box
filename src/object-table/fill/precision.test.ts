import { beforeEach, describe, expect, it } from 'vitest';
import { precisionNumber, type FillPrecision } from './precision';
import { multiTarget } from './multi';
import { fillMatrix, seriesValues, type FillRule } from './series';
import { defaultUnits, unitMultiplier } from '../numbers/model';
import { multiply } from '../numbers/decimal';
import { literal } from '../numbers/number';
import { useObjectTable } from '../store';
import { parseObjectProject, serializeObjectProject } from '../project';

const units = defaultUnits(), integer: FillPrecision = { mode: 'integer' }, cents: FillPrecision = { mode: 'decimal', digits: 2 };
const fill = (seed: string, multiplier: string, precision?: FillPrecision): FillRule => ({ operation: 'multi', operand: 1, multi: multiTarget(seed, [{ index: 0, multiplier }], units, precision) });
beforeEach(() => useObjectTable.setState(useObjectTable.getInitialState(), true));
describe('多数字精度', () => {
  it('完整精度和旧规则不改变结果', () => {
    const seed = '力量+1.125亿', old = fill(seed, '2.5');
    expect(seriesValues([seed], 1, { letter: 'D', fill: old }, false, units)).toEqual(['力量+2.8125亿']);
    expect(precisionNumber('281250000', units)).toBe('2.8125亿');
    expect(precisionNumber('281250000', units, { mode: 'full' })).toBe('2.8125亿');
  });
  it('单位后的系数四舍五入、正负半数、去末尾零及负零', () => {
    for (const [value, expected] of [['1.5', '2'], ['-1.5', '-2'], ['-0.49', '0'], ['0.5', '1'], ['0', '0']]) expect(precisionNumber(value, units, integer)).toBe(expected);
    for (const [value, expected] of [['1.005', '1.01'], ['-1.005', '-1.01'], ['1.200', '1.2'], ['-0.0049', '0']]) expect(precisionNumber(value, units, cents)).toBe(expected);
    expect(precisionNumber('1757812500', units, cents)).toBe('17.58亿');
    expect(precisionNumber('1757812500', units, integer)).toBe('18亿');
    expect(precisionNumber('1.123456789012345678905', units, { mode: 'decimal', digits: 20 })).toBe('1.12345678901234567891');
  });
  it('跨档进位从原值重算，192单位与负数均支持', () => {
    expect(precisionNumber('9999.5', units, integer)).toBe('1万');
    expect(precisionNumber('99999999.5', units, integer)).toBe('1亿');
    expect(precisionNumber('-99999999.5', units, integer)).toBe('-1亿');
    units.units.forEach((u, i) => {
      expect(precisionNumber(multiply(unitMultiplier(units, i), '1.235'), units, cents)).toBe('1.24' + u.name);
    });
  });
  it('自定义非十进制按精确商舍入；升档不双重舍入', () => {
    const custom = { ...units, base: 3, units: [{ id: 'a', name: '级' }, { id: 'b', name: '阶' }] };
    expect(precisionNumber('4', custom, cents)).toBe('1.33级');
    expect(precisionNumber('8.99', custom, cents)).toBe('1阶');
    expect(precisionNumber('8.984', custom, cents)).toBe('2.99级');
    expect(precisionNumber('4', custom, { mode: 'full' })).toBe('4');
  });
  it('一次下拉保留精确中间值，末行续拉使用实际保存值', () => {
    const column = { letter: 'D', fill: fill('力量1', '1.5', integer) };
    const rows = seriesValues(['力量1'], 3, column, false, units);
    expect(rows).toEqual(['力量2', '力量2', '力量3']);
    expect(seriesValues([rows[0]], 1, column, false, units)).toEqual(['力量3']);
    expect(seriesValues(['力量1', ...rows], 1, column, false, units)).toEqual(['力量5']);
  });
  it('百分号与全角空白、颜色和其他词条保持', () => {
    const seed = '|cff00ff00伤害增幅＋　1.235　万%|r  敏捷+5';
    expect(seriesValues([seed], 1, { letter: 'D', fill: fill(seed, '1', cents) }, false, units)).toEqual(['|cff00ff00伤害增幅＋1.24万%|r  敏捷+5']);
  });
  it('舍入后的值仍检查容量；矩阵失败无部分修改', () => {
    const small = { ...units, units: [], storageBits: 32 };
    expect(() => precisionNumber('2147483647.5', small, integer)).toThrow('容量');
    const sheet = structuredClone(useObjectTable.getState().sheets.unit);
    sheet.units = small;
    const col = 2, key = sheet.columns[col].key, seed = '力量2147483647.5';
    sheet.columns[col].fill = { operation: 'multi', operand: 1, multi: multiTarget(seed, [{ index: 0, multiplier: '1' }], small, integer) };
    sheet.rows = [{ id: 'first', cells: { [key]: seed } }, { id: 'second', cells: { [key]: '原文' } }];
    const before = structuredClone(sheet);
    expect(() => fillMatrix(sheet, { start: { row: 0, col }, end: { row: 0, col } }, 1, new Set(), false)).toThrow('容量');
    expect(sheet).toEqual(before);
  });
  it('保存、深拷贝、精度独立修改与一次撤销重做', () => {
    const rule = fill('力量1', '1.5', cents), state = useObjectTable.getState();
    state.setFillRule('unit', 'unit:D', rule);
    const precision = rule.multi!.precision;
    if (precision?.mode === 'decimal') precision.digits = 9;
    const parsed = parseObjectProject(serializeObjectProject());
    expect(parsed.sheets.unit.columns[2].fill!.multi!.precision).toEqual(cents);
    state.restore(parsed); state.setFillRule('unit', 'unit:D', fill('力量1', '1.5', integer));
    state.undo(); expect(useObjectTable.getState().sheets.unit.columns[2].fill!.multi!.precision).toEqual(cents);
    state.redo(); expect(useObjectTable.getState().sheets.unit.columns[2].fill!.multi!.precision).toEqual(integer);
  });
  it('错误位数、模式在导入时拒绝', () => {
    const rule = fill('力量1', '1.5', cents); useObjectTable.getState().setFillRule('unit', 'unit:D', rule);
    const json = JSON.parse(serializeObjectProject());
    for (const precision of [{ mode: 'decimal', digits: 0 }, { mode: 'decimal', digits: 21 }, { mode: 'decimal', digits: 2.5 }, { mode: 'decimal', digits: '2' }, { mode: 'bad' }]) {
      json.sheets.unit.columns[2].fill.multi.precision = precision;
      expect(() => parseObjectProject(JSON.stringify(json))).toThrow();
    }
    expect(literal(precisionNumber('123456789012345678901', units, cents), units)).toBe('123000000000000000000');
  });
});
