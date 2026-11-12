import { beforeEach, describe, expect, it } from 'vitest';
import { defaultUnits, type UnitSettings } from '../numbers/model';
import { literal } from '../numbers/number';
import { descriptionNumbers, multiTarget } from './multi';
import { fillMatrix, seriesValues, validateFillRule, type FillRule } from './series';
import { useObjectTable } from '../store';
import { parseObjectProject, serializeObjectProject } from '../project';

const units = defaultUnits();
const rule = (seed: string, multipliers: [number, string][], u = units): FillRule => ({ operation: 'multi', operand: 1, multi: multiTarget(seed, multipliers.map(([index, multiplier]) => ({ index, multiplier })), u) });
const values = (seed: string, multipliers: [number, string][], count = 3, u = units) => seriesValues([seed], count, { letter: 'D', fill: rule(seed, multipliers, u) }, false, u);
beforeEach(() => useObjectTable.setState(useObjectTable.getInitialState(), true));
describe('商品介绍多数字倍率', () => {
  it('独立倍率、颜色码、换行与未选数字逐字保持', () => {
    const seed = '|cffff8800攻击+1万|r\n生命+5000万；暴击+1.5%；版本2026';
    expect(descriptionNumbers(seed, units).map(t => t.text)).toEqual(['+1万', '+5000万', '+1.5', '2026']);
    expect(values(seed, [[0, '10000'], [1, '2'], [2, '0.5']], 1)).toEqual(['|cffff8800攻击+1亿|r\n生命+1亿；暴击+0.75%；版本2026']);
  });
  it('重复数字按位置选择；首行保持，逐行累乘', () => {
    expect(values('攻击100；生命100；保留100', [[0, '2'], [1, '3']])).toEqual(['攻击200；生命300；保留100', '攻击400；生命900；保留100', '攻击800；生命2700；保留100']);
  });
  it('跨单位升降后可从最后一行或整个选区续拉', () => {
    const seed = '攻击+5000万；生命-1万', fill = rule(seed, [[0, '2'], [1, '0.5']]);
    const next = seriesValues([seed], 2, { letter: 'D', fill }, false, units);
    expect(next).toEqual(['攻击+1亿；生命-5000', '攻击+2亿；生命-2500']);
    expect(seriesValues([next[1]], 1, { letter: 'D', fill }, false, units)).toEqual(['攻击+4亿；生命-1250']);
    expect(seriesValues([seed, ...next], 1, { letter: 'D', fill }, false, units)).toEqual(['攻击+4亿；生命-1250']);
  });
  it('十进制精确、负倍率、零及百分号不额外除100', () => {
    expect(values('A-0.1%；B+0.2％；C9007199254740993', [[0, '-2'], [1, '0'], [2, '1.0000000000000001']], 1)).toEqual(['A0.2%；B+0％；C9007.1992547409939007199254740993兆']);
    expect(values('A0.1', [[0, '0.1']])).toEqual(['A0.01', 'A0.001', 'A0.0001']);
  });
  it('自定义非十进制进位，仅能精确缩写时换单位', () => {
    const custom: UnitSettings = { ...units, base: 3, units: [{ id: 'a', name: '级' }, { id: 'b', name: '阶' }] };
    expect(values('力量1级；敏捷2', [[0, '3'], [1, '2']], 1, custom)).toEqual(['力量1阶；敏捷4']);
    expect(values('力量1阶', [[0, '0.1']], 1, custom)).toEqual(['力量0.9']);
  });
  it('数字和单位间空白、带空白负号和全角符号保留正确含义', () => {
    expect(values('力量- 1 万；敏捷＋1 万；智力－0.5 万', [[0, '-2'], [1, '10000'], [2, '2']], 1)).toEqual(['力量2万；敏捷＋1亿；智力-1万']);
  });
  it('最长单位优先且完整支持原192档', () => {
    expect(units.units).toHaveLength(192);
    units.units.forEach((u, index) => {
      const seed = '属性1' + u.name, result = values(seed, [[0, '2']], 1)[0];
      expect(literal(result.slice(2), units)).toBe((2n * BigInt(units.base) ** BigInt(index + 1)).toString());
    });
    const u = { ...units, units: [{ id: 'a', name: '万' }, { id: 'b', name: '万亿' }] };
    expect(descriptionNumbers('1万亿', u)[0].text).toBe('1万亿');
  });
  it('结构改变、单位改变和后续源行结构不同都拒绝', () => {
    const fill = rule('攻击1万；生命1万', [[0, '2']]);
    expect(() => seriesValues(['防御1万；生命1万'], 1, { letter: 'D', fill }, false, units)).toThrow('重新选择');
    expect(() => seriesValues(['攻击1万；生命1万', '其他1万'], 1, { letter: 'D', fill }, false, units)).toThrow('重新选择');
    expect(() => seriesValues(['攻击1万；生命1万'], 1, { letter: 'D', fill }, false, { ...units, base: 1000 })).toThrow('单位配置');
  });
  it('非法倍率、重复位置、超限与缺少单位均拒绝', () => {
    for (const multiplier of ['', 'NaN', 'Infinity', '1e2', '1/2', ' 2']) expect(() => rule('攻击1', [[0, multiplier]])).toThrow();
    expect(() => rule('攻击1', [[0, '1'], [0, '2']])).toThrow('重复');
    expect(() => rule('攻击1', [[1, '1']])).toThrow('位置');
    expect(() => validateFillRule({ operation: 'multi', operand: 1 })).toThrow();
    const small = { ...units, storageBits: 32, units: [] };
    expect(() => values('攻击1000000000', [[0, '2']], 3, small)).toThrow('第 3 行');
    expect(() => seriesValues(['攻击1'], 1, { letter: 'D', fill: rule('攻击1', [[0, '2']]) })).toThrow('单位配置');
  });
  it('长介绍保留全部词条与颜色，不选择的数值不变', () => {
    const seed = Array.from({ length: 300 }, (_, i) => `词条${i}|cff123456值100|r`).join('\n');
    expect(descriptionNumbers(seed, units)).toHaveLength(600);
    const result = values(seed, [[1, '2'], [599, '3']], 1)[0];
    expect(result).toBe(seed.replace('词条0|cff123456值100', '词条0|cff123456值200').replace('词条299|cff123456值100', '词条299|cff123456值300'));
  });
  it('单位消失导致相邻数字合并时拒绝，不写入不可续拉结果', () => {
    expect(() => values('1万2万', [[0, '0.5'], [1, '0.1']], 1)).toThrow('重新选择');
  });
  it('列规则深拷贝、保存恢复、倍率单独修改及撤销重做', () => {
    const fill = rule('攻击100；生命100', [[0, '2'], [1, '3']]);
    useObjectTable.getState().setFillRule('unit', 'unit:D', fill);
    fill.multi!.targets[0].multiplier = '9';
    const restored = parseObjectProject(serializeObjectProject());
    expect(restored.sheets.unit.columns[2].fill!.multi!.targets[0].multiplier).toBe('2');
    useObjectTable.getState().restore(restored);
    useObjectTable.getState().setFillRule('unit', 'unit:D', fill);
    expect(useObjectTable.getState().sheets.unit.columns[2].fill!.multi!.targets[0].multiplier).toBe('9');
    useObjectTable.getState().undo();
    expect(useObjectTable.getState().sheets.unit.columns[2].fill!.multi!.targets[0].multiplier).toBe('2');
    useObjectTable.getState().redo();
    expect(useObjectTable.getState().sheets.unit.columns[2].fill!.multi!.targets[0].multiplier).toBe('9');
    restored.sheets.unit.columns[2].fill!.multi!.targets[0].multiplier = 'bad';
    expect(() => parseObjectProject(JSON.stringify(restored))).toThrow();
  });
  it('整次矩阵失败不修改数据，成功填充一次撤销恢复', () => {
    const id = 'unit', state = useObjectTable.getState(), sheet = state.sheets[id], col = 2, key = sheet.columns[col].key;
    state.write(id, 0, col, [['攻击100；生命100']]);
    state.setFillRule(id, key, rule('攻击100；生命100', [[0, '2'], [1, '3']]));
    const before = useObjectTable.getState().sheets[id], selection = { start: { row: 0, col }, end: { row: 0, col } };
    const matrix = fillMatrix(before, selection, 3, new Set(), false);
    state.write(id, 1, col, matrix);
    expect(useObjectTable.getState().sheets[id].rows[3].cells[key]).toBe('攻击800；生命2700');
    state.undo(); expect(useObjectTable.getState().sheets[id].rows).toEqual(before.rows);
    state.redo(); expect(useObjectTable.getState().sheets[id].rows[3].cells[key]).toBe('攻击800；生命2700');
    const saved = useObjectTable.getState().sheets[id];
    expect(() => fillMatrix({ ...saved, units: { ...units, base: 1000 } }, selection, 3, new Set(), false)).toThrow('单位');
    expect(useObjectTable.getState().sheets[id]).toBe(saved);
  });
});
