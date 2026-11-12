export function encodeTsv(rows: string[][]) { return rows.map(row => row.map(value => /[\t\r\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join('\t')).join('\r\n'); }
export function decodeTsv(text: string): string[][] {
  const rows: string[][] = [[]]; let value = '', quoted = false, start = true;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && (quoted || start)) {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (char === '\t' || char === '\n' || char === '\r')) {
      rows.at(-1)!.push(value); value = ''; start = true;
      if (char !== '\t') { if (char === '\r' && text[i + 1] === '\n') i++; rows.push([]); }
      continue;
    } else value += char;
    start = false;
  }
  if (quoted) throw new Error('粘贴内容中的引号未闭合');
  rows.at(-1)!.push(value);
  if (rows.length > 1 && rows.at(-1)!.length === 1 && rows.at(-1)![0] === '' && /[\r\n]$/.test(text)) rows.pop();
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (rows.length > 100000) throw new Error('粘贴范围超过 100000 行');
  if (width * rows.length > 200000) throw new Error('粘贴区域超过 20 万格，请分批复制');
  return rows.map(row => [...row, ...Array(width - row.length).fill('')]);
}
export const clipboardType = 'application/x-box-object-cells';
