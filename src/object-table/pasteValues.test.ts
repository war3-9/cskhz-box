import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ClipboardEvent } from 'react';
import { initialSheets, initialViews } from './model';
import { useObjectTable } from './store';
import { useGridClipboard } from './grid/useClipboard';
import { createCalculator } from './formulas/engine';
import { clipboardType } from './clipboard';
import { clipboardValues, readClipboardPayload } from './clipboardPayload';

beforeEach(() => useObjectTable.setState({ ...useObjectTable.getInitialState(), sheets: initialSheets(), views: initialViews() }, true));
afterEach(() => vi.unstubAllGlobals());
const handlers = (row: number, col = 3, endRow = row) => useGridClipboard('item', { start: { row, col }, end: { row: endRow, col } }, createCalculator(useObjectTable.getState().sheets), message => { if (!message.startsWith('已')) throw Error(message); });
function copy(row = 0, col = 3, endRow = row) {
  const data = new Map<string, string>();
  handlers(row, col, endRow).events.onCopy({ target: { tagName: 'DIV' }, preventDefault() {}, clipboardData: { setData: (k: string, v: string) => data.set(k, v) } } as unknown as ClipboardEvent);
  vi.stubGlobal('navigator', { clipboard: { read: async () => [{ types: ['text/plain', 'text/html'], getType: async (type: string) => new Blob([data.get(type)!], { type }) }] } });
  return data;
}
const raw = (row: number) => useObjectTable.getState().sheets.item.rows[row]?.cells['item:E'] ?? '';
const display = (row: number) => createCalculator(useObjectTable.getState().sheets).read('item', row + 3, 5).text;
it('same-column normal paste shifts formulas; paste-values preserves colored text even beside an empty cell', async () => {
  const color = '|cffff8000UR-浩然剑|r|n第二行';
  useObjectTable.getState().write('item', 0, 2, [[color, '=D3']]); copy();
  await handlers(1).pasteFromClipboard(); expect(raw(1)).toBe('=D4'); expect(display(1)).toBe('0');
  await handlers(2).pasteFromClipboard(true); expect(raw(2)).toBe(color); expect(display(2)).toBe(color);
  useObjectTable.getState().undo(); expect(raw(2)).toBe(''); expect(raw(1)).toBe('=D4');
});
it('paste-values is the copy-time snapshot and follows fields from another starting column', async () => {
  useObjectTable.getState().write('item', 0, 2, [['12', '=D3*2']]); copy();
  useObjectTable.getState().write('item', 0, 2, [['99']]);
  await handlers(2, 0).pasteFromClipboard(true);
  expect(raw(2)).toBe('24'); expect(display(0)).toBe('198');
});
it('empty rows and literal results beginning with equals/apostrophe are preserved', async () => {
  for (const value of ['=literal', "'quoted", '0007', '']) {
    useObjectTable.getState().write('item', 0, 3, [[`="${value}"`]]); copy();
    await handlers(1).pasteFromClipboard(true); expect(display(1)).toBe(value);
    if (value.startsWith('=')) expect(raw(1)).toBe("'=literal");
  }
  useObjectTable.getState().write('item', 0, 3, [[''], ['']]); copy(0, 3, 1);
  useObjectTable.getState().write('item', 2, 3, [['old'], ['old']]);
  await handlers(2).pasteFromClipboard(true); expect([raw(2), raw(3)]).toEqual(['', '']);
});
it('old payloads use clipboard display text, while malformed snapshots are rejected', () => {
  useObjectTable.getState().write('item', 0, 2, [['|cff00ff00剑|r', '=D3']]);
  const data = copy(), payload = JSON.parse(data.get(clipboardType)!); delete payload.values;
  expect(clipboardValues(data.get('text/plain')!, 'item', readClipboardPayload(JSON.stringify(payload)).origin)).toEqual([['|cff00ff00剑|r']]);
  payload.values = [['one', 'two']]; expect(() => readClipboardPayload(JSON.stringify(payload))).toThrow('显示值');
});
it('external text pasted as values never executes a leading equals string', async () => {
  vi.stubGlobal('navigator', { clipboard: { read: async () => [{ types: ['text/plain'], getType: async () => new Blob(['=D3']) }] } });
  await handlers(1).pasteFromClipboard(true); expect(raw(1)).toBe("'=D3"); expect(display(1)).toBe('=D3');
});
