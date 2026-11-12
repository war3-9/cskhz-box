import { bounds, type Cell, type CellRange, type CellSelection } from './geometry';
import type { Sheet } from '../model';

export const ranges = (s: CellSelection): CellRange[] => [...(s.ranges ?? []), { start: s.start, end: s.end }];
const contains = (range: CellRange, cell: Cell) => {
  const b = bounds(range);
  return cell.row >= b.r1 && cell.row <= b.r2 && cell.col >= b.c1 && cell.col <= b.c2;
};
export const selectedCell = (s: CellSelection, cell: Cell) => ranges(s).some(r => contains(r, cell));
export function toggleRange(s: CellSelection, range: CellRange): CellSelection {
  const b = bounds(range), old = ranges(s);
  if (!old.some(r => { const a = bounds(r); return a.r1 <= b.r1 && a.r2 >= b.r2 && a.c1 <= b.c1 && a.c2 >= b.c2; })) {
    return { ...range, ranges: old };
  }
  const remaining: CellRange[] = [];
  const add = (r1: number, c1: number, r2: number, c2: number) => { if (r1 <= r2 && c1 <= c2) remaining.push({ start: { row: r1, col: c1 }, end: { row: r2, col: c2 } }); };
  for (const r of old) {
    const a = bounds(r), r1 = Math.max(a.r1, b.r1), r2 = Math.min(a.r2, b.r2), c1 = Math.max(a.c1, b.c1), c2 = Math.min(a.c2, b.c2);
    if (r1 > r2 || c1 > c2) { remaining.push(r); continue; }
    add(a.r1, a.c1, r1 - 1, a.c2); add(r2 + 1, a.c1, a.r2, a.c2);
    add(r1, a.c1, r2, c1 - 1); add(r1, c2 + 1, r2, a.c2);
  }
  const last = remaining.pop();
  return last ? { ...last, ranges: remaining } : { ...range };
}

/** Pack selected rows/columns in sheet order. The mask prevents pasting holes. */
export function selectionMatrix(sheet: Sheet, s: CellSelection, hidden: Set<string>) {
  const rs = new Set<number>(), cs = new Set<number>(), areas = ranges(s).map(bounds);
  const fullRows = areas.every(a => a.c1 === 0 && a.c2 === sheet.columns.length - 1);
  for (const a of areas) {
    for (let r = a.r1; r <= a.r2; r++) rs.add(r);
    for (let c = a.c1; c <= a.c2; c++) if (sheet.columns[c] && (fullRows || !hidden.has(sheet.columns[c].key))) cs.add(c);
  }
  if (rs.size * cs.size > 200000) throw new Error('复制区域超过 20 万格，请分批复制');
  const rows = [...rs].sort((a, b) => a - b), cols = [...cs].sort((a, b) => a - b);
  const mask = rows.map(row => cols.map(col => selectedCell(s, { row, col })));
  const raw = rows.map((row, r) => cols.map((col, c) => mask[r][c] ? sheet.rows[row]?.cells[sheet.columns[col].key] ?? '' : ''));
  return { rows, cols, mask, raw, fullRows };
}
