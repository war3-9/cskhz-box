import { afterEach, expect, it, vi } from 'vitest';
import { clipboardFromData, clipboardHtml, afterClipboardWrite } from './systemClipboard';
import { useGridClipboard } from './useClipboard';
import { useObjectTable } from '../store';
import { initialSheets, initialViews } from '../model';
import { createCalculator } from '../formulas/engine';

afterEach(() => vi.unstubAllGlobals());
const handlers = (report: (text: string) => void, row = 0) => useGridClipboard('item', { start: { row, col: 2 }, end: { row, col: 2 } }, createCalculator(useObjectTable.getState().sheets), report);
function setup(write: () => Promise<void>) {
  useObjectTable.setState({ ...useObjectTable.getInitialState(), sheets: initialSheets(), views: initialViews() }, true);
  useObjectTable.getState().write('item', 0, 2, [['source']]);
  vi.stubGlobal('ClipboardItem', class {});
  vi.stubGlobal('navigator', { clipboard: { write } });
}
it('HTML retains Unicode, formulas and quotes without relying on custom MIME', () => {
  const data = { text: '剑\t说明\n下一行', payload: JSON.stringify({ raw: [['<img src=x>', '=B3', '中文"&']] }) };
  const html = clipboardHtml(data);
  expect(html).not.toContain('<img');
  expect(clipboardFromData({ getData: type => type === 'text/html' ? html : type === 'text/plain' ? data.text : '' })).toEqual(data);
  expect(clipboardFromData({ getData: type => type === 'text/plain' ? 'external' : '' })).toEqual({ text: 'external', payload: undefined });
});
it('a rejected system write leaves cut data intact and blocks the immediately following stale paste', async () => {
  setup(async () => { throw Error('denied'); });
  const messages: string[] = [], before = useObjectTable.getState().sheets;
  await handlers(m => messages.push(m)).copyToClipboard(true);
  expect(useObjectTable.getState().sheets).toBe(before);
  expect(messages.join()).toContain('失败');
  await expect(afterClipboardWrite()).rejects.toThrow('denied');
});
it('changing the source while a cut write is pending never erases newer edits', async () => {
  let release!: () => void;
  setup(() => new Promise<void>(resolve => { release = resolve; }));
  const messages: string[] = [];
  const pending = handlers(m => messages.push(m)).copyToClipboard(true);
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  useObjectTable.getState().write('item', 0, 2, [['newer']]);
  release(); await pending;
  expect(useObjectTable.getState().sheets.item.rows[0].cells['item:D']).toBe('newer');
  expect(messages.join()).toContain('未清除');
  await expect(afterClipboardWrite()).rejects.toThrow('表格已变化');
});
it('changing hidden columns during a pending cut clears only the cells actually copied', async () => {
  let release!: () => void;
  setup(() => new Promise<void>(resolve => { release = resolve; }));
  useObjectTable.getState().write('item', 0, 2, [['source', 'hidden', 'last']]);
  useObjectTable.getState().setView('item', { hiddenColumns: ['item:E'] });
  const pending = useGridClipboard('item', { start: { row: 0, col: 2 }, end: { row: 0, col: 4 } }, createCalculator(useObjectTable.getState().sheets), () => {}).copyToClipboard(true);
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  useObjectTable.getState().setView('item', { hiddenColumns: [] });
  release(); await pending;
  const cells = useObjectTable.getState().sheets.item.rows[0].cells;
  expect(cells['item:D']).toBeUndefined(); expect(cells['item:F']).toBeUndefined();
  expect(cells['item:E']).toBe('hidden');
});
