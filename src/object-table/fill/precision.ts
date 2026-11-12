import { z } from 'zod';
import { normalize } from '../numbers/decimal';
import { compactNumber, checkCapacity, literal } from '../numbers/number';
import type { UnitSettings } from '../numbers/model';

export const fillPrecisionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('full') }),
  z.object({ mode: z.literal('integer') }),
  z.object({ mode: z.literal('decimal'), digits: z.number().int().min(1).max(20) }),
]);
export type FillPrecision = z.infer<typeof fillPrecisionSchema>;

/** Round the exact quotient, including nondecimal unit bases, without Number. */
export function precisionNumber(value: string, settings: UnitSettings, precision?: FillPrecision): string {
  if (!precision || precision.mode === 'full') return compactNumber(value, settings);
  fillPrecisionSchema.parse(precision);
  const normalized = normalize(value), negative = normalized.startsWith('-');
  const [whole, fraction = ''] = normalized.replace(/^-/, '').split('.');
  const numerator = BigInt(whole + fraction), scale = 10n ** BigInt(fraction.length);
  const digits = precision.mode === 'integer' ? 0 : precision.digits, places = 10n ** BigInt(digits);
  const base = BigInt(settings.base);
  let index = -1, factor = 1n;
  while (index + 1 < settings.units.length && numerator >= factor * base * scale) { index++; factor *= base; }
  let rounded: bigint;
  for (;;) {
    const denominator = factor * scale, n = numerator * places;
    rounded = n / denominator + (n % denominator * 2n >= denominator ? 1n : 0n);
    if (index + 1 >= settings.units.length || rounded < base * places) break;
    // Recompute from the original value after promotion; never round twice.
    index++; factor *= base;
  }
  let coefficient = rounded.toString().padStart(digits + 1, '0');
  if (digits) coefficient = coefficient.slice(0, -digits) + '.' + coefficient.slice(-digits);
  const result = normalize((negative ? '-' : '') + coefficient) + (index < 0 ? '' : settings.units[index].name);
  checkCapacity(literal(result, settings), settings.storageBits);
  return result;
}
