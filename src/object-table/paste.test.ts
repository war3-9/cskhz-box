import { beforeEach, expect, it, vi } from 'vitest';
import type { ClipboardEvent } from 'react';
import { useObjectTable } from './store';
import { columnLetter, initialSheets, initialViews, type Sheet } from './model';
import { useGridClipboard } from './grid/useClipboard';
import { createCalculator } from './formulas/engine';
import { clipboardType, decodeTsv, encodeTsv } from './clipboard';
import { clipboardPayload, readClipboardPayload } from './clipboardPayload';
import { planPaste } from './pastePlan';
import { compileNative, mapProject } from './native/mapping';
import { currentProject, parseObjectProject, serializeObjectProject } from './project';
import type { CategoryId } from './schema';

beforeEach(() => useObjectTable.setState({ ...useObjectTable.getInitialState(), sheets: initialSheets(), views: initialViews() }, true));
function copy(col = 0, end = useObjectTable.getState().sheets.ability.columns.length - 1, cut = false) {
  const data = new Map<string, string>();
  const handlers = useGridClipboard('ability', { start: { row: 0, col }, end: { row: 0, col: end } }, createCalculator(useObjectTable.getState().sheets), () => {});
  handlers.events[cut ? 'onCut' : 'onCopy']({ target: { tagName: 'DIV' }, preventDefault() {}, clipboardData: { setData: (kind: string, text: string) => data.set(kind, text) } } as unknown as ClipboardEvent);
  return data;
}
function paste(data: Map<string, string>, col = 0, row = 0, kind: CategoryId = 'ability') {
  const messages: string[] = [];
  useGridClipboard(kind, { start: { row, col }, end: { row, col } }, createCalculator(useObjectTable.getState().sheets), text => messages.push(text)).events.onPaste({
    target: { tagName: 'DIV' }, preventDefault() {}, clipboardData: { getData: (type: string) => data.get(type) ?? '' },
  } as unknown as ClipboardEvent);
  return messages;
}
const text = (value: string) => new Map([['text/plain', value]]);
function extra(sheet: Sheet, fields: string[]): Sheet {
  return { ...sheet, columns: [...sheet.columns, ...fields.map((field, i) => { const letter = columnLetter(sheet.columns.length + i + 2); return { key: `ability:${letter}`, letter, field, title: field, width: 180 }; })] };
}
function replace(sheet: Sheet) { useObjectTable.setState(state => ({ sheets: { ...state.sheets, ability: sheet } })); }
function source(fields = ['ExtraOne', 'ExtraTwo']) {
  const sheet = extra(initialSheets().ability, fields);
  sheet.rows = [{ id: 'source-row', cells: { 'ability:B': 'A001', 'ability:C': 'AHbz', [sheet.columns.at(-2)!.key]: '17', [sheet.columns.at(-1)!.key]: '29' } }];
  replace(sheet); return sheet;
}
it('copies level 6 through actual handlers; compiles, saves, reopens and undoes columns and rows together', () => {
  const project = mapProject({ path: 'fixture.w3x', fingerprint: 'fixture', strings: {}, raw: {}, imports: [], warnings: [], objects: {
    'ability:A001': { id: 'A001', parent: 'AHbz', custom: true, fields: { 'Hbz1:6:1': { id: 'Hbz1', level: 6, data: 1, type: 0, value: 17 } } },
  } });
  useObjectTable.getState().restore(project); const copied = copy();
  useObjectTable.setState({ ...useObjectTable.getInitialState(), sheets: initialSheets(), views: initialViews() }, true);
  const before = useObjectTable.getState().sheets;
  expect(paste(copied, 10)[0]).toContain('补齐 1 列');
  const state = useObjectTable.getState(), after = state.sheets;
  expect(state.pastBooks).toHaveLength(1);
  expect(after.ability.columns.at(-1)?.field).toBe('DataA6');
  const result = compileNative(parseObjectProject(serializeObjectProject()));
  expect(result.issues).toEqual([]); expect(result.objects['ability:A001'].fields['Hbz1:6:1'].value).toBe(17);
  state.undo(); expect(useObjectTable.getState().sheets).toBe(before);
  state.redo(); expect(useObjectTable.getState().sheets).toBe(after);
  state.restore(parseObjectProject(serializeObjectProject()));
  expect(compileNative(currentProject()).objects['ability:A001'].fields['Hbz1:6:1'].value).toBe(17);
});
it('matches reordered fields and preserves target-only data', () => {
  source(); const copied = copy(); const target = extra(initialSheets().ability, ['ExtraTwo', 'OnlyTarget', 'ExtraOne']);
  target.rows = [{ id: 'existing', cells: { [target.columns.at(-2)!.key]: 'keep' } }]; replace(target);
  expect(paste(copied)[0]).toContain('补齐 0 列');
  const cells = useObjectTable.getState().sheets.ability.rows[0].cells;
  expect(cells[target.columns.at(-3)!.key]).toBe('29'); expect(cells[target.columns.at(-1)!.key]).toBe('17'); expect(cells[target.columns.at(-2)!.key]).toBe('keep');
});
it('matches duplicate field occurrences without collapsing values', () => {
  source(['Repeated', 'Repeated']); const copied = copy(); replace(extra(initialSheets().ability, ['Repeated']));
  expect(paste(copied)[0]).toContain('补齐 1 列');
  const sheet = useObjectTable.getState().sheets.ability;
  expect(sheet.rows[0].cells[sheet.columns.at(-2)!.key]).toBe('17'); expect(sheet.rows[0].cells[sheet.columns.at(-1)!.key]).toBe('29');
});
it('ID/template columns follow fixed roles even when an imported workbook uses other aliases', () => {
  const sheet = source(); sheet.columns = sheet.columns.map((column, index) => index < 2 ? { ...column, field: index ? '_parent' : '_id' } : column);
  const copied = copy(); replace(initialSheets().ability);
  expect(paste(copied)[0]).toContain('补齐 2 列');
  const cells = useObjectTable.getState().sheets.ability.rows[0].cells;
  expect(cells['ability:B']).toBe('A001'); expect(cells['ability:C']).toBe('AHbz');
});
it('extra target duplicates cannot silently override the copied effective field', () => {
  source(['ExtraOne', 'ExtraTwo']); const copied = copy(); replace(extra(initialSheets().ability, ['ExtraOne', 'ExtraOne']));
  const before = useObjectTable.getState().sheets;
  expect(paste(copied)[0]).toContain('重复列'); expect(useObjectTable.getState().sheets).toBe(before);
});
it('whole rows retain hidden source fields and match hidden target fields without changing visibility', () => {
  const sheet = source(); useObjectTable.getState().setView('ability', { hiddenColumns: [sheet.columns[0].key, sheet.columns.at(-1)!.key] });
  const copied = copy(); replace(extra(initialSheets().ability, ['ExtraTwo']));
  const hidden = [useObjectTable.getState().sheets.ability.columns.at(-1)!.key]; useObjectTable.getState().setView('ability', { hiddenColumns: hidden });
  paste(copied); const state = useObjectTable.getState();
  expect(state.sheets.ability.rows[0].cells[hidden[0]]).toBe('29'); expect(state.sheets.ability.rows[0].cells['ability:B']).toBe('A001'); expect(state.views.ability.hiddenColumns).toEqual(hidden);
});
it('ordinary object cells follow field identity and shift relative rows', () => {
  useObjectTable.getState().write('ability', 0, 2, [['=B3+$C$3']]); const copied = copy(2, 2);
  expect(paste(copied, 3, 1)[0]).toContain('按物编字段');
  expect(useObjectTable.getState().sheets.ability.rows[1].cells['ability:D']).toBe('=B4+$C$3');
});
it('plain values, numeric-looking text and empty cells keep their values when copied down', () => {
  for (const value of ['UR-浩然剑', '1234', '1,234', '0.25', '0007', '', '0', '说明|n下一行']) {
    useObjectTable.getState().write('ability', 0, 2, [[value]]);
    const copied = copy(2, 2); paste(copied, 2, 1);
    const state = useObjectTable.getState();
    expect(state.sheets.ability.rows[1]?.cells['ability:D'] ?? '').toBe(value);
    expect(createCalculator(state.sheets).read('ability', 4, 4).text).toBe(value);
  }
});
it('a relative formula copied alone can evaluate to zero when its new referenced cell is empty', () => {
  useObjectTable.getState().write('ability', 0, 2, [['=E3', '1234']]);
  expect(createCalculator(useObjectTable.getState().sheets).read('ability', 3, 4).text).toBe('1234');
  const copied = copy(2, 2); paste(copied, 2, 1);
  const state = useObjectTable.getState();
  expect(state.sheets.ability.rows[1].cells['ability:D']).toBe('=E4');
  expect(createCalculator(state.sheets).read('ability', 4, 4).text).toBe('0');
});
it('partial fields follow reordered columns and add missing fields without overwriting ID/template', () => {
  const src = source(); const copied = copy(src.columns.length - 2);
  const target = extra(initialSheets().ability, ['ExtraTwo']);
  target.rows = [{ id: 'keep', cells: { 'ability:B': 'A999', 'ability:C': 'AHds' } }]; replace(target);
  expect(paste(copied, 0)[0]).toContain('补齐 1 列');
  const sheet = useObjectTable.getState().sheets.ability, cells = sheet.rows[0].cells;
  expect(cells['ability:B']).toBe('A999'); expect(cells['ability:C']).toBe('AHds');
  expect(cells[sheet.columns.find(c => c.field === 'ExtraOne')!.key]).toBe('17');
  expect(cells[sheet.columns.find(c => c.field === 'ExtraTwo')!.key]).toBe('29');
});
it('local custom sheets keep positional copy metadata, including whole rows', () => {
  const sheet = initialSheets().ability;
  const data = readClipboardPayload(clipboardPayload('local-test' as CategoryId, sheet, sheet.columns, [sheet.columns.map(() => 'local')], 3, true));
  expect(data.records).toBeUndefined();
});
it('whole-record formulas follow reordered field columns, preserve absolute rows and shift relative rows', () => {
  const sheet = source(); sheet.rows[0].cells['ability:D'] = '=DT3+$DU$3'; const copied = copy();
  replace(extra(initialSheets().ability, ['ExtraTwo', 'ExtraOne'])); paste(copied, 0, 2);
  expect(useObjectTable.getState().sheets.ability.rows[2].cells['ability:D']).toBe('=DU5+$DT$3');
});
it('noncontiguous formula ranges fail before adding columns or writing data', () => {
  const sheet = source(); sheet.rows[0].cells['ability:D'] = '=SUM(DT3:DU3)'; const copied = copy();
  replace(extra(initialSheets().ability, ['ExtraTwo'])); const before = useObjectTable.getState().sheets;
  expect(paste(copied)[0]).toContain('不连续'); expect(useObjectTable.getState().sheets).toBe(before); expect(useObjectTable.getState().pastBooks).toHaveLength(0);
});
it('whole records cannot silently move between object categories', () => {
  source(); const copied = copy(), before = useObjectTable.getState().sheets;
  expect(paste(copied, 0, 0, 'unit')[0]).toContain('相同类别'); expect(useObjectTable.getState().sheets).toBe(before);
});
it('the 512-column limit cancels the whole paste', () => {
  source(); const copied = copy(), base = initialSheets().ability;
  replace(extra(base, Array.from({ length: 512 - base.columns.length }, (_, i) => `Target${i}`)));
  const before = useObjectTable.getState().sheets;
  expect(paste(copied)[0]).toContain('512'); expect(useObjectTable.getState().sheets).toBe(before);
});
it('plain TSV reports exact source/available widths and retains all values on failure', () => {
  const width = initialSheets().ability.columns.length;
  const before = useObjectTable.getState().sheets;
  expect(paste(text('value' + '\t'.repeat(width)))[0]).toContain(`123 列`);
  expect(paste(text(encodeTsv([Array(width).fill('x')])), 1)[0]).toContain('121 个未隐藏列');
  expect(useObjectTable.getState().sheets).toBe(before);
});
it('1000 narrow rows and quoted tabs/newlines paste successfully', () => {
  expect(paste(text(encodeTsv(Array.from({ length: 1000 }, () => ['说明\t文字\n下一行']))))).toEqual([]);
  expect(useObjectTable.getState().sheets.ability.rows).toHaveLength(1000);
  expect(useObjectTable.getState().sheets.ability.rows[999].cells['ability:B']).toBe('说明\t文字\n下一行');
});
it('old internal clipboard remains positional and preserves raw formulas', () => {
  const data = text('3'); data.set(clipboardType, JSON.stringify({ raw: [['=B3']], row: 3, col: 4 }));
  expect(paste(data, 3, 1)).toEqual([]); expect(useObjectTable.getState().sheets.ability.rows[1].cells['ability:E']).toBe('=C4');
});
it('malformed record metadata cannot fall back to positional writes', () => {
  source(); const data = copy(), payload = JSON.parse(data.get(clipboardType)!); payload.columns.pop(); data.set(clipboardType, JSON.stringify(payload));
  const before = useObjectTable.getState().sheets; expect(paste(data)[0]).toContain('不完整'); expect(useObjectTable.getState().sheets).toBe(before);
});
it('cut clears only after a successful system write and preserves hidden cells', async () => {
  vi.stubGlobal('ClipboardItem', class { constructor(public data: unknown) {} });
  let finish!: () => void;
  vi.stubGlobal('navigator', { clipboard: { write: () => new Promise<void>(resolve => { finish = resolve; }) } });
  useObjectTable.getState().write('ability', 0, 2, [['a', 'hidden', 'b']]);
  useObjectTable.getState().setView('ability', { hiddenColumns: ['ability:E'] });
  const before = useObjectTable.getState().sheets.ability;
  const task = useGridClipboard('ability', { start: { row: 0, col: 2 }, end: { row: 0, col: 4 } }, createCalculator(useObjectTable.getState().sheets), () => {}).copyToClipboard(true);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  expect(useObjectTable.getState().sheets.ability).toBe(before);
  finish(); await task;
  expect(useObjectTable.getState().sheets.ability.rows[0].cells['ability:E']).toBe('hidden');
  expect(useObjectTable.getState().sheets.ability.rows[0].cells['ability:D']).toBeUndefined();
  vi.unstubAllGlobals();
});
it('stale plans and row overflow leave the book untouched', () => {
  const sheet = useObjectTable.getState().sheets.ability, plan = planPaste('ability', sheet, [], 0, 0, [['x']]);
  useObjectTable.getState().write('ability', 0, 0, [['new']]); const before = useObjectTable.getState().sheets;
  expect(() => useObjectTable.getState().paste('ability', 0, plan)).toThrow('已变化'); expect(useObjectTable.getState().sheets).toBe(before);
  expect(() => planPaste('ability', sheet, [], 99999, 0, [['a'], ['b']])).toThrow('100000');
});
it('clipboard dimension checks avoid stack overflow and prevent sparse padding explosions', () => {
  expect(() => decodeTsv(Array(100001).fill('a').join('\n'))).toThrow('100000');
  expect(() => decodeTsv('a\t'.repeat(1000) + '\n' + 'x\n'.repeat(1000))).toThrow('20 万格');
  const sheet = initialSheets().ability;
  expect(() => readClipboardPayload(clipboardPayload('ability', sheet, sheet.columns, Array.from({ length: 1700 }, () => Array(122).fill('x')), 3, true))).toThrow('20 万格');
});
