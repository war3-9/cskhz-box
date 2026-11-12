export type ArithmeticOperation = 'add' | 'subtract' | 'multiply' | 'divide';
export const arithmeticOperations: [ArithmeticOperation, string][] = [['add', '加 +'], ['subtract', '减 −'], ['multiply', '乘 ×'], ['divide', '除 ÷']];
export function calculateStep(base: number, operation: ArithmeticOperation, operand: number, step: number) {
  return operation === 'add' ? base + operand * step : operation === 'subtract' ? base - operand * step : operation === 'multiply' ? base * operand ** step : base / operand ** step;
}
export function formatNumber(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error('计算结果超出安全数值范围');
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(15)));
}
