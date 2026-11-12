export interface ColorRun { text: string; color?: string }
export const presets = ['b0e9ee', 'ff2424', '8694fe', 'ffb97c', 'e8a4fc', 'ffff69', 'c57d89', '7dff47', '999999', '27a8ef', 'ffff00', 'ffffff'];
export const colorFields = new Set(['name', 'description', 'tip', 'ubertip', 'editorname', 'bufftip']);
export function parseColors(code: string): ColorRun[] {
  const runs: ColorRun[] = []; let color: string | undefined, last = 0;
  const add = (text: string) => { if (text) runs.push({ text, color }); };
  for (const match of code.matchAll(/\|c([\da-f]{8})|\|r|\|n/gi)) {
    add(code.slice(last, match.index));
    if (match[1]) color = match[1].toLowerCase(); else if (match[0].toLowerCase() === '|r') color = undefined; else add('\n');
    last = match.index! + match[0].length;
  }
  add(code.slice(last)); return runs;
}
export function encodeColors(runs: ColorRun[]): string {
  const merged: ColorRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = merged.at(-1); if (last && last.color === run.color) last.text += run.text; else merged.push({ ...run });
  }
  return merged.map(run => { const text = run.text.replace(/\r\n|\r|\n/g, '|n'); return run.color ? `|c${run.color}${text}|r` : text; }).join('');
}
export function colorRange(code: string, start: number, end: number, color?: string): string {
  const runs = parseColors(code), length = runs.reduce((n, r) => n + r.text.length, 0), result: ColorRun[] = [];
  if (start === end) { start = 0; end = length; }
  let offset = 0;
  for (const run of runs) {
    const a = Math.max(0, Math.min(run.text.length, start - offset)), b = Math.max(a, Math.min(run.text.length, end - offset));
    result.push({ ...run, text: run.text.slice(0, a) }, { text: run.text.slice(a, b), color }, { ...run, text: run.text.slice(b) }); offset += run.text.length;
  }
  return encodeColors(result);
}
