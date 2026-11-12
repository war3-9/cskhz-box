/** Excel's plain-text clipboard includes display grouping. Never guess decimal commas. */
export function numericText(value: string): number | undefined {
  let text = value.trim().normalize('NFKC').replace(/\u2212/g, '-');
  if (!text) return undefined;
  const accounting = /^\([^()]+\)$/.test(text);
  if (accounting) text = text.slice(1, -1).trim();
  if (!accounting && /^(?:0x[\da-f]+|0b[01]+|0o[0-7]+)$/i.test(text)) return Number(text);
  if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)) text = text.replaceAll(',', '');
  else if (/^[+-]?\d{1,3}(?: \d{3})+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)) text = text.replaceAll(' ', '');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return undefined;
  if (accounting && /^[+-]/.test(text)) return undefined;
  return Number(text) * (accounting ? -1 : 1);
}
