// Exact decimal arithmetic. Never convert a gameplay amount to Number.
export function normalize(value: string): string {
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!m || value.length > 16000) throw new Error('需要完整的十进制数值');
  const whole = m[2].replace(/^0+(?=\d)/, ''), fraction = (m[3] ?? '').replace(/0+$/, '');
  return (m[1] === '-' && (whole !== '0' || fraction) ? '-' : '') + whole + (fraction ? '.' + fraction : '');
}
function parts(value: string) {
  const text = normalize(value), scale = text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
  return { n: BigInt(text.replace('.', '')), scale };
}
function format(n: bigint, scale: number) {
  const negative = n < 0n; let s = (negative ? -n : n).toString().padStart(scale + 1, '0');
  if (scale) s = s.slice(0, -scale) + '.' + s.slice(-scale);
  return normalize((negative ? '-' : '') + s);
}
export function add(a: string, b: string) {
  const x = parts(a), y = parts(b), scale = Math.max(x.scale, y.scale);
  return format(x.n * 10n ** BigInt(scale - x.scale) + y.n * 10n ** BigInt(scale - y.scale), scale);
}
export const negate = (a: string) => { a = normalize(a); return a === '0' ? '0' : a.startsWith('-') ? a.slice(1) : '-' + a; };
export const subtract = (a: string, b: string) => add(a, negate(b));
export function multiply(a: string, b: string) { const x = parts(a), y = parts(b); return format(x.n * y.n, x.scale + y.scale); }
export function shift(a: string, power: number) {
  const x = parts(a), scale = x.scale - power;
  return scale < 0 ? format(x.n * 10n ** BigInt(-scale), 0) : format(x.n, scale);
}
