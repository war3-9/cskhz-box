import type { CellResult } from '../formulas/engine';
import { columnNumber, MAX_ROWS, type SheetData } from '../model';
import { coloredTitle } from './ColoredText';
import { HEADER_HEIGHT, ROW_HEIGHT } from './geometry';

/** Explicit line breaks determine height across all non-hidden columns, including offscreen ones. */
export function createRowLayout(sheet: SheetData, hidden: ReadonlySet<string>, showColors: boolean, read: (row: number, col: number) => CellResult) {
  const columns = new Map(sheet.columns.filter(c => !hidden.has(c.key)).map(c => [c.key, columnNumber(c.letter)]));
  const offsets = [HEADER_HEIGHT];
  for (let row = 0; row < sheet.rows.length; row++) {
    let lines = 1;
    for (const [key, raw] of Object.entries(sheet.rows[row].cells)) {
      const col = columns.get(key);
      if (col === undefined || (!raw.startsWith('=') && !/[\r\n]|\|n/i.test(raw))) continue;
      const result = raw.startsWith('=') ? read(row + 3, col) : { text: raw };
      const text = coloredTitle(result.text, showColors);
      lines = Math.max(lines, text.split(/\r\n|\r|\n/).length);
    }
    offsets.push(offsets[row] + ROW_HEIGHT + (lines - 1) * 18);
  }
  const top = (row: number) => offsets[Math.min(row, sheet.rows.length)] + Math.max(0, row - sheet.rows.length) * ROW_HEIGHT;
  const height = (row: number) => row < sheet.rows.length ? offsets[row + 1] - offsets[row] : ROW_HEIGHT;
  const rowAt = (y: number) => {
    if (y >= offsets.at(-1)!) return Math.min(MAX_ROWS - 1, sheet.rows.length + Math.floor((y - offsets.at(-1)!) / ROW_HEIGHT));
    let low = 0, high = sheet.rows.length;
    while (low < high) { const mid = (low + high + 1) >>> 1; if (offsets[mid] <= y) low = mid; else high = mid - 1; }
    return low;
  };
  return { top, height, rowAt };
}
