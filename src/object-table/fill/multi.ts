import { z } from 'zod';
import { multiply, normalize } from '../numbers/decimal';
import { checkCapacity, literal } from '../numbers/number';
import { unitSignature, type UnitSettings } from '../numbers/model';
import { fillPrecisionSchema, precisionNumber, type FillPrecision } from './precision';

export const multiTargetSchema = z.object({
  segments: z.array(z.string()).min(2).max(2001),
  targets: z.array(z.object({ index: z.number().int().nonnegative(), multiplier: z.string().max(16000) })).min(1).max(2000),
  units: z.string().min(1).max(200000),
  precision: fillPrecisionSchema.optional(),
});
export type MultiFillTarget = z.infer<typeof multiTargetSchema>;
export interface NumberToken { start: number; end: number; text: string }

/** Color escapes are opaque. Positions refer to numeric occurrences, never values. */
export function descriptionNumbers(text: string, settings: UnitSettings): NumberToken[] {
  const names = settings.units.map(u => u.name).sort((a, b) => b.length - a.length);
  const result: NumberToken[] = [];
  const matcher = /[|]c[0-9a-f]{8}|(?:[+＋－-][ \t\u3000]*)?[0-9]+(?:[.][0-9]+)?/gi;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text))) {
    if (match[0].startsWith('|')) continue;
    let unitStart = matcher.lastIndex;
    while (text[unitStart] === ' ' || text[unitStart] === '\t' || text[unitStart] === '\u3000') unitStart++;
    const name = names.find(n => text.startsWith(n, unitStart));
    if (name) matcher.lastIndex = unitStart + name.length;
    result.push({ start: match.index, end: matcher.lastIndex, text: text.slice(match.index, matcher.lastIndex) });
    if (result.length > 2000) throw Error('一格最多选择 2000 段数字，请拆分介绍');
  }
  return result;
}
function segments(text: string, tokens: NumberToken[]) {
  return [...tokens.map((token, i) => text.slice(i ? tokens[i - 1].end : 0, token.start)), text.slice(tokens.at(-1)?.end ?? 0)];
}
export function validateMultiTarget(target: MultiFillTarget) {
  multiTargetSchema.parse(target);
  const seen = new Set<number>();
  for (const t of target.targets) {
    if (t.index >= target.segments.length - 1 || seen.has(t.index)) throw Error('数字位置无效或重复，请重新选择');
    seen.add(t.index);
    try { normalize(t.multiplier); } catch { throw Error(`第 ${t.index + 1} 段倍率填写错误，请输入数字，例如2或1.5`); }
  }
}
export function multiTarget(seed: string, targets: MultiFillTarget['targets'], settings: UnitSettings, precision?: FillPrecision): MultiFillTarget {
  if (!targets.length) throw Error('请至少勾选一段数字');
  const result = { segments: segments(seed, descriptionNumbers(seed, settings)), targets: targets.map(t => ({ ...t })), units: unitSignature(settings), ...(precision ? { precision: { ...precision } } : {}) };
  validateMultiTarget(result);
  return result;
}
export function readMultiNumbers(seed: string, target: MultiFillTarget, settings: UnitSettings) {
  if (target.units !== unitSignature(settings)) throw Error('单位配置已变化，请先刷新并处理表格单位，再重新选择数字');
  const tokens = descriptionNumbers(seed, settings);
  if (JSON.stringify(segments(seed, tokens)) !== JSON.stringify(target.segments)) throw Error('介绍文字结构已变化，请重新选择数字');
  return tokens;
}

/** Compute a complete series in memory. A failure never exposes a partial fill. */
export function multiSeries(seeds: string[], count: number, target: MultiFillTarget, settings: UnitSettings): string[] {
  validateMultiTarget(target);
  if ((seeds.length + count) * target.targets.length > 2_000_000) throw Error('一次最多计算 200 万个数字，请缩小填充范围');
  const tokens = readMultiNumbers(seeds[0], target, settings);
  for (const seed of seeds.slice(1)) readMultiNumbers(seed, target, settings);
  const amounts = target.targets.map(t => {
    const raw = tokens[t.index].text.replace(/[ \t\u3000]/g, '').replace('＋', '+').replace('－', '-');
    const value = literal(raw, settings);
    checkCapacity(value, settings.storageBits); checkCapacity(normalize(t.multiplier), settings.storageBits);
    return value;
  });
  const result: string[] = []; let characters = 0;
  for (let step = 1; step < seeds.length + count; step++) {
    target.targets.forEach((t, i) => {
      try { amounts[i] = multiply(amounts[i], t.multiplier); checkCapacity(amounts[i], settings.storageBits); }
      catch (e) { throw Error(`第 ${step + 1} 行、第 ${t.index + 1} 段数字：${String(e).replace(/^Error: /, '')}`); }
    });
    if (step < seeds.length) continue;
    const texts = tokens.map(t => t.text);
    target.targets.forEach((t, i) => {
      const value = precisionNumber(amounts[i], settings, target.precision);
      const plus = /^[+＋]/.exec(tokens[t.index].text)?.[0];
      texts[t.index] = (plus && !value.startsWith('-') ? plus : '') + value;
    });
    const text = target.segments.map((s, i) => s + (texts[i] ?? '')).join('');
    // Adjacent numbers can merge when a unit disappears. Never persist an ambiguous rule result.
    readMultiNumbers(text, target, settings);
    characters += text.length;
    if (characters > 32_000_000) throw Error('本次介绍填充文本过长，请缩小填充范围');
    result.push(text);
  }
  return result;
}
