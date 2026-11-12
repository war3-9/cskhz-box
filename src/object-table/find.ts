import type { SheetData } from './model';
import { sheetFieldLabels } from './native/fieldLabels';
export type FindScope = 'all' | 'columns' | 'cells';
export interface FindMatch { kind: 'column' | 'cell'; row: number; col: number }
export function findObjectMatches(sheet: SheetData, query: string, scope: FindScope, kind = ""): FindMatch[] {
  const q = query.toLocaleLowerCase(), result: FindMatch[] = []; if (!q) return result;
  const labels = scope !== 'cells' ? sheetFieldLabels(kind, sheet.rows.map(r => r.cells[sheet.columns[1]?.key] ?? ''), sheet.columns) : [];
  if (scope !== 'cells') sheet.columns.forEach((_, col) => { if (labels[col].toLocaleLowerCase().includes(q)) result.push({ kind: 'column', row: 0, col }); });
  if (scope !== 'columns') {
    const columns = new Map(sheet.columns.map((c, i) => [c.key, i]));
    sheet.rows.forEach((row, r) => Object.entries(row.cells).forEach(([key, value]) => { const col = columns.get(key); if (col !== undefined && value.toLocaleLowerCase().includes(q)) result.push({ kind: 'cell', row: r, col }); }));
    result.sort((a, b) => (a.kind === b.kind ? a.row - b.row || a.col - b.col : a.kind === 'column' ? -1 : 1));
  }
  return result;
}
