import { multiply, normalize, shift } from './decimal';
import { defaultUnits, unitMultiplier, type UnitSettings } from './model';

const defaults = defaultUnits();
export function runtimeUnitDisplay(settings: UnitSettings) {
  let factor = 1n, rest = BigInt(settings.base), twos = 0, fives = 0;
  while (rest % 2n === 0n) { rest /= 2n; twos++; }
  while (rest % 5n === 0n) { rest /= 5n; fives++; }
  return { percent: Object.fromEntries(settings.registered.filter(r => r.unit === 'percent').map(r => [r.attribute, true])),
    units: settings.units.map((u, i) => { factor *= BigInt(settings.base); return { name: u.name, factor: factor.toString(), places: Math.max(twos, fives) * (i + 1) }; }) };
}
export function displayAttribute(value: string, attribute: string, settings: UnitSettings) {
  const percent = settings.registered.find(t => t.attribute === attribute)?.unit === 'percent';
  return compactNumber(percent ? shift(value, 2) : value, settings) + (percent ? '%' : '');
}
export function literal(text: string, settings: UnitSettings = defaults): string {
  const m = /^([+-]?\d+(?:\.\d+)?)(.*)$/u.exec(text.trim());
  if (!m) throw Error('需要完整数字，可接本工程登记的单位');
  const value = normalize(m[1]), suffix = m[2].trim();
  if (!suffix) return value;
  const index = settings.units.findIndex(u => u.name === suffix);
  if (index < 0) throw Error('未登记单位：' + suffix);
  return multiply(value, unitMultiplier(settings, index));
}
export function checkCapacity(value: string, bits: number) {
  const parts = normalize(value).replace(/^-/, '').split('.'), bound = (1n << BigInt(bits - 1)) - 1n;
  if (BigInt(parts[0]) > bound || (parts[1] && 10n ** BigInt(parts[1].length) > bound)) throw Error('数值或小数位超出原大数容量');
}
// Exact shortening only. A nonterminating quotient remains a full decimal.
export function compactNumber(value: string, settings: UnitSettings = defaults): string {
  const normalized = normalize(value), negative = normalized.startsWith('-'), [whole, fraction = ''] = normalized.replace(/^-/, '').split('.');
  const numerator = BigInt(whole + fraction), scale = 10n ** BigInt(fraction.length);
  for (let i = settings.units.length - 1; i >= 0; i--) {
    const factor = BigInt(unitMultiplier(settings, i));
    if (numerator < factor * scale) continue;
    let divisor = factor * scale, n = numerator;
    const gcd = (a: bigint, b: bigint): bigint => b ? gcd(b, a % b) : a;
    const g = gcd(n, divisor); n /= g; divisor /= g;
    let twos = 0, fives = 0;
    while (divisor % 2n === 0n) { divisor /= 2n; twos++; }
    while (divisor % 5n === 0n) { divisor /= 5n; fives++; }
    if (divisor !== 1n) continue;
    const digits = Math.max(twos, fives); n *= 2n ** BigInt(digits - twos) * 5n ** BigInt(digits - fives);
    let s = n.toString().padStart(digits + 1, '0');
    if (digits) s = s.slice(0, -digits) + '.' + s.slice(-digits);
    return normalize((negative ? '-' : '') + s) + settings.units[i].name;
  }
  return normalized;
}
