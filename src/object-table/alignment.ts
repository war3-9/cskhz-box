import { emptyRow, MAX_ROWS, type CellAlignment, type SheetData } from './model';
import { ranges } from './grid/selection';
import { bounds, type CellSelection } from './grid/geometry';

export function alignCells(sheet: SheetData, selection: CellSelection, alignment: CellAlignment) {
  if (selection.ranges?.length) {
    let current = sheet;
    for (const range of ranges(selection)) current = { ...current, rows: alignCells(current, range, alignment) };
    return current.rows;
  }
  const { r1, r2, c1, c2 } = bounds(selection);
  if (![r1, r2, c1, c2].every(Number.isInteger) || r1 < 0 || r2 >= MAX_ROWS || c1 < 0 || c2 >= sheet.columns.length) throw new Error('对齐范围超过当前表格');
  if (!['left', 'center', 'right'].includes(alignment)) throw new Error('无效的对齐方式');
  const rows = [...sheet.rows], keys = sheet.columns.slice(c1, c2 + 1).map(c => c.key);
  let changed = false;
  for (let index = r1; index <= r2; index++) {
    const row = rows[index];
    if (keys.every(key => (row?.alignments?.[key] ?? 'left') === alignment)) continue;
    while (rows.length <= index) rows.push(emptyRow());
    const alignments = { ...rows[index].alignments };
    for (const key of keys) {
      if (alignment === 'left') delete alignments[key]; else alignments[key] = alignment;
    }
    rows[index] = { ...rows[index], alignments: Object.keys(alignments).length ? alignments : undefined };
    changed = true;
  }
  return changed ? rows : sheet.rows;
}

export function selectionAlignment(sheet: SheetData, selection: CellSelection): CellAlignment | null {
  if (selection.ranges?.length) {
    const values = ranges(selection).map(range => selectionAlignment(sheet, range));
    return values.every(value => value === values[0]) ? values[0] : null;
  }
  const { r1, r2, c1, c2 } = bounds(selection);
  const keys = sheet.columns.slice(c1, c2 + 1).map(c => c.key);
  const alignment = sheet.rows[r1]?.alignments?.[keys[0]] ?? 'left';
  if (r2 >= sheet.rows.length && alignment !== 'left') return null;
  for (let index = r1; index <= Math.min(r2, sheet.rows.length - 1); index++) {
    if (keys.some(key => (sheet.rows[index].alignments?.[key] ?? 'left') !== alignment)) return null;
  }
  return alignment;
}
