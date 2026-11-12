import type { ObjectColumn } from '../schema';
export const ROW_HEIGHT = 31, HEADER_HEIGHT = 64, ROW_GUTTER = 42;
export interface Cell { row: number; col: number }
export interface CellRange { start: Cell; end: Cell }
export interface CellSelection extends CellRange { ranges?: CellRange[] }
export const bounds = (s: CellSelection) => ({ r1: Math.min(s.start.row, s.end.row), r2: Math.max(s.start.row, s.end.row), c1: Math.min(s.start.col, s.end.col), c2: Math.max(s.start.col, s.end.col) });
export function columnOffsets(columns: ObjectColumn[]) { const offsets = [ROW_GUTTER]; columns.forEach(c => offsets.push(offsets.at(-1)! + c.width)); return offsets; }
export function effectiveFrozen(desired: number, offsets: number[], width: number) { let n = Math.min(desired, offsets.length - 1); while (n > 0 && offsets[n] > width - 160) n--; return n; }
export function closestFreeze(x: number, offsets: number[], width: number) { const max = effectiveFrozen(offsets.length - 1, offsets, width); let best = 0; for (let n = 1; n <= max; n++) if (Math.abs(offsets[n] - x) < Math.abs(offsets[best] - x)) best = n; return best; }
