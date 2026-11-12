import { beforeEach, expect, it, vi } from 'vitest';
import type { ClipboardEvent } from 'react';
import { ranges, selectedCell, selectionMatrix, toggleRange } from './selection';
import { initialSheets, initialViews } from '../model';
import { useGridClipboard } from './useClipboard';
import { useObjectTable } from '../store';
import { createCalculator } from '../formulas/engine';
import { clipboardType, decodeTsv } from '../clipboard';
import type { CellSelection } from './geometry';
const cell = (row: number, col: number) => ({ start: { row, col }, end: { row, col } });
beforeEach(() => {
  const sheets = initialSheets();
  sheets.item.rows = Array.from({ length: 8 }, (_, r) => ({ id: String(r), cells: Object.fromEntries(sheets.item.columns.slice(0, 8).map((c, i) => [c.key, `${r}:${i}`])) }));
  useObjectTable.setState({ ...useObjectTable.getInitialState(), sheets, views: initialViews() }, true);
});
function handlers(selection: CellSelection, data = new Map<string, string>(), messages: string[] = []) {
  return { data, messages, events: useGridClipboard('item', selection, createCalculator(useObjectTable.getState().sheets), m => messages.push(m)).events, event: { target: { tagName: 'DIV' }, preventDefault() {}, clipboardData: { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '' } } as unknown as ClipboardEvent };
}
it('Ctrl toggles a cell out of a rectangle without selecting its neighbors', () => {
  const source = { start: { row: 0, col: 0 }, end: { row: 2, col: 2 } };
  const result = toggleRange(source, cell(1, 1));
  expect(selectedCell(result, { row: 1, col: 1 })).toBe(false);
  expect(ranges(result)).toHaveLength(4);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) expect(selectedCell(result, { row: r, col: c })).toBe(r !== 1 || c !== 1);
});
it('copies multiple rows/columns in sheet order, leaves holes untouched on paste and undoes once', () => {
  const selected = toggleRange(cell(3, 4), cell(1, 2)), source = handlers(selected);
  source.events.onCopy(source.event);
  expect(decodeTsv(source.data.get('text/plain')!)).toEqual([['1:2', ''], ['', '3:4']]);
  const target = handlers(cell(5, 2), source.data); target.events.onPaste(target.event);
  const rows = useObjectTable.getState().sheets.item.rows;
  expect([rows[5].cells['item:D'], rows[5].cells['item:E'], rows[6].cells['item:D'], rows[6].cells['item:F']]).toEqual(['1:2', '5:3', '6:2', '3:4']);
  useObjectTable.getState().undo(); expect(useObjectTable.getState().sheets.item.rows[5].cells['item:D']).toBe('5:2');
});
it('cut only clears selected cells and hidden columns are not copied accidentally', async () => {
  vi.stubGlobal('ClipboardItem', class {}); vi.stubGlobal('navigator', { clipboard: { write: async () => {} } });
  const source = handlers(toggleRange(cell(0, 2), cell(2, 4))); await source.events.onCut(source.event); vi.unstubAllGlobals();
  const rows = useObjectTable.getState().sheets.item.rows;
  expect(rows[0].cells['item:D']).toBeUndefined(); expect(rows[2].cells['item:F']).toBeUndefined(); expect(rows[1].cells['item:E']).toBe('1:3');
  useObjectTable.getState().undo(); expect(useObjectTable.getState().sheets.item.rows[0].cells['item:D']).toBe('0:2');
  const matrix = selectionMatrix(useObjectTable.getState().sheets.item, { start: { row: 0, col: 2 }, end: { row: 1, col: 4 } }, new Set(['item:E']));
  expect(matrix.cols).toEqual([2, 4]);
});
it('packed rows adjust each formula using its actual original row', () => {
  useObjectTable.getState().write('item', 1, 2, [['=B4']]); useObjectTable.getState().write('item', 3, 2, [['=B6']]);
  const source = handlers(toggleRange(cell(1, 2), cell(3, 2))); source.events.onCopy(source.event);
  const target = handlers(cell(5, 2), source.data); target.events.onPaste(target.event);
  const rows = useObjectTable.getState().sheets.item.rows;
  expect(rows[5].cells['item:D']).toBe('=B8'); expect(rows[6].cells['item:D']).toBe('=B9');
  expect(JSON.parse(source.data.get(clipboardType)!).rows).toEqual([4, 6]);
});
it('does not intercept copying inside an input and rejects paste into disjoint targets', () => {
  const source = handlers(cell(1, 2)); source.events.onCopy({ ...source.event, target: { tagName: 'INPUT' } } as unknown as ClipboardEvent);
  expect(source.data.size).toBe(0);
  const target = handlers(toggleRange(cell(1, 2), cell(3, 2))); target.events.onPaste(target.event);
  expect(target.messages[0]).toContain('一个起始单元格');
});
