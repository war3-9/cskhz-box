import { calculateStep, formatNumber, type ArithmeticOperation } from './arithmetic';

export interface CustomFillTarget { operator: ArithmeticOperation; prefix: string; suffix: string }
const numericPart = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
export function readCustomNumber(seed: string, target: CustomFillTarget) {
  if (!seed.startsWith(target.prefix) || !seed.endsWith(target.suffix) || seed.length <= target.prefix.length + target.suffix.length) throw new Error('首格与自定义规则的文字格式不一致，请重新选取变动数字');
  const raw = seed.slice(target.prefix.length, seed.length - target.suffix.length);
  if (!numericPart.test(raw) || !Number.isFinite(Number(raw))) throw new Error('请只选中一段数字，可包含正负号或小数点');
  if (Math.abs(Number(raw)) > Number.MAX_SAFE_INTEGER) throw new Error('选中的数字超出安全数值范围');
  return raw;
}
export function customTarget(seed: string, start: number, end: number, operator: ArithmeticOperation): CustomFillTarget {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > seed.length) throw new Error('请在原文中选中需要变化的数字');
  const target = { operator, prefix: seed.slice(0, start), suffix: seed.slice(end) };
  readCustomNumber(seed, target);
  return target;
}
export function customValue(seed: string, target: CustomFillTarget, operand: number, step: number) {
  const raw = readCustomNumber(seed, target), result = calculateStep(Number(raw), target.operator, operand, step);
  let formatted = formatNumber(result);
  // Preserve a selected 001 even when its result grows wider or becomes decimal.
  const integer = raw.replace(/^[+-]/, '').split('.')[0];
  if (/^0\d+$/.test(integer)) {
    const sign = formatted.startsWith('-') ? '-' : raw.startsWith('+') ? '+' : '';
    const [whole, fraction] = formatted.replace(/^-/, '').split('.');
    formatted = sign + whole.padStart(integer.length, '0') + (fraction === undefined ? '' : '.' + fraction);
  } else if (raw.startsWith('+') && !formatted.startsWith('-')) formatted = '+' + formatted;
  return target.prefix + formatted + target.suffix;
}
