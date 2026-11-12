import type { ObjectColumn } from '../schema';
import { MAX_ROWS, type SheetData } from '../model';
import { shiftFormula } from '../formulas/references';
import { bounds, type CellSelection } from '../grid/geometry';
import { arithmeticOperations, calculateStep, formatNumber } from './arithmetic';
import { customValue, type CustomFillTarget } from './custom';
import { rawcodeBytes, rawcodeString, validRawcode } from '../native/rawcode';
import { multiSeries, validateMultiTarget, type MultiFillTarget } from './multi';
import { fillUnitContext } from './units';
import type { UnitSettings } from '../numbers/model';

export type FillOperation = 'auto' | 'copy' | 'add' | 'subtract' | 'multiply' | 'divide' | 'custom' | 'multi';
export interface FillRule { operation: FillOperation; operand: number; custom?: CustomFillTarget; multi?: MultiFillTarget }
export const defaultFillRule: FillRule = { operation: 'auto', operand: 1 };
export const fillOperations: [FillOperation, string][] = [['auto', '自动（数字 / 编号递增，公式跟随）'], ['copy', '复制首格'], ...arithmeticOperations, ['custom', '自定义（指定字符串中的数字）'], ['multi', '自定义（多数字倍率）']];
export function validateFillRule(rule: FillRule) {
  if (!fillOperations.some(([op]) => op === rule.operation) || !Number.isFinite(rule.operand)) throw new Error('请选择有效的填充算法和数值');
  if (rule.operation === 'custom' && (!rule.custom || !arithmeticOperations.some(([op]) => op === rule.custom?.operator) || typeof rule.custom.prefix !== 'string' || typeof rule.custom.suffix !== 'string')) throw new Error('请在原文中选中需要变化的数字并设置运算');
  if ((rule.operation === 'divide' || rule.operation === 'custom' && rule.custom?.operator === 'divide') && rule.operand === 0) throw new Error('除数不能为 0');
  if (rule.operation === 'multi') { if (!rule.multi) throw Error('请至少勾选一段数字'); validateMultiTarget(rule.multi); }
}
const numeric = (value: string) => value.trim() !== '' && Number.isFinite(Number(value));
const suffix = (value: string) => /^(.*?)(\d+)$/.exec(value);

/** Returns one column's series, without changing the source or writing partial results. */
export function seriesValues(seeds: string[], count: number, column: Pick<ObjectColumn, 'fill' | 'letter'>, validateRawcode = true, units?: UnitSettings): string[] {
  const rule = column.fill ?? defaultFillRule; validateFillRule(rule);
  if (!seeds.length || !Number.isInteger(count) || count < 0 || count > MAX_ROWS) throw new Error('填充范围无效');
  const first = seeds[0], last = seeds.at(-1)!, previous = seeds.at(-2);
  if (rule.operation === 'copy') return Array(count).fill(first);
  if (rule.operation === 'multi') {
    if (!units) throw Error('工作表缺少单位配置，请先关联所属工程并检查应用');
    const values = multiSeries(seeds, count, rule.multi!, units);
    if (validateRawcode && column.letter === 'B' && values.some(v => !validRawcode(v))) throw Error('自定义 ID 必须保持有效四字节');
    return values;
  }
  if (rule.operation === 'custom') return Array.from({ length: count }, (_, i) => {
    const result = customValue(first, rule.custom!, rule.operand, seeds.length + i);
    if (validateRawcode && column.letter === 'B' && !validRawcode(result)) throw new Error('自定义 ID 必须保持 4 位，特殊 ID 须保持有效四字节，请调整起始编号或填充范围');
    return result;
  });
  if (validateRawcode && column.letter === 'B' && seeds.some(id => id.length === 10 && validRawcode(id))) {
    const values = seeds.map(id => {
      const bytes = rawcodeBytes(id); if (!bytes || !validRawcode(id)) throw new Error('特殊 ID 填充起始值无效');
      return bytes.reduce((n, byte) => n * 256 + byte, 0);
    });
    const step = values.length > 1 ? values.at(-1)! - values.at(-2)! : 1;
    return Array.from({ length: count }, (_, i) => {
      const value = rule.operation === 'auto' ? values.at(-1)! + step * (i + 1)
        : calculateStep(values[0], rule.operation as Exclude<FillOperation, 'auto' | 'copy' | 'custom' | 'multi'>, rule.operand, seeds.length + i);
      if (!Number.isInteger(value) || value <= 0 || value > 0xffffffff) throw new Error('特殊 ID 填充结果超出四字节范围');
      return rawcodeString([24, 16, 8, 0].map(shift => (value >>> shift) & 255));
    });
  }
  if (rule.operation !== 'auto') {
    const operation = rule.operation;
    const numbered = (!numeric(first) || /^0\d+$/.test(first)) && suffix(first);
    if (!numeric(first) && !numbered) throw new Error(`${column.letter} 列首格必须是数字或末尾带数字的编号`);
    const base = Number(numbered ? numbered[2] : first);
    return Array.from({ length: count }, (_, i) => {
      const step = seeds.length + i;
      const result = calculateStep(base, operation, rule.operand, step);
      return numbered ? formatSuffix(numbered, result, column, validateRawcode) : formatNumber(result);
    });
  }
  if (last.startsWith('=')) return Array.from({ length: count }, (_, i) => shiftFormula(last, i + 1, 0));
  const numbered = suffix(last);
  // Digit-only identifiers retain their leading zeroes, just like f001.
  if (numbered && (!numeric(last) || /^0\d+$/.test(last))) {
    const before = previous === undefined ? null : suffix(previous);
    const step = before && before[1] === numbered[1] ? Number(numbered[2]) - Number(before[2]) : 1;
    return Array.from({ length: count }, (_, i) => formatSuffix(numbered, Number(numbered[2]) + step * (i + 1), column, validateRawcode));
  }
  if (numeric(last)) {
    const step = previous !== undefined && numeric(previous) ? Number(last) - Number(previous) : 1;
    return Array.from({ length: count }, (_, i) => formatNumber(Number(last) + step * (i + 1)));
  }
  return Array.from({ length: count }, (_, i) => {
    const offset = i % seeds.length, raw = seeds[offset];
    return shiftFormula(raw, seeds.length + i - offset, 0);
  });
}
function formatSuffix(match: RegExpExecArray, value: number, column: Pick<ObjectColumn, 'letter'>, validateRawcode: boolean) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${column.letter} 列编号的结果必须是非负安全整数`);
  const result = match[1] + String(value).padStart(match[2].length, '0');
  if (validateRawcode && column.letter === 'B' && !validRawcode(result)) throw new Error('自定义 ID 必须保持 4 位，请调整起始编号或填充范围');
  return result;
}
export function fillMatrix(sheet: SheetData, selection: CellSelection, endRow: number, hidden: ReadonlySet<string> = new Set(), validateRawcode = true) {
  const b = bounds(selection), count = endRow - b.r2;
  if (!Number.isInteger(endRow) || endRow >= MAX_ROWS || count < 1 || b.r1 < 0 || b.c1 < 0 || b.c2 >= sheet.columns.length) throw new Error('请从首格向下选择或拖动填充范围');
  if (count * (b.c2 - b.c1 + 1) > 200000) throw new Error('一次最多填充 20 万格');
  const context = fillUnitContext(sheet.units);
  const columns = sheet.columns.slice(b.c1, b.c2 + 1).map(column => hidden.has(column.key)
    ? Array.from({ length: count }, (_, r) => sheet.rows[b.r2 + 1 + r]?.cells[column.key] ?? '') : seriesValues(
    Array.from({ length: b.r2 - b.r1 + 1 }, (_, i) => sheet.rows[b.r1 + i]?.cells[column.key] ?? ''), count, column, validateRawcode, context.units,
  ));
  return Array.from({ length: count }, (_, r) => columns.map(values => values[r]));
}
