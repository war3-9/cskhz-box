import { expect, it } from 'vitest';
import type { ClipboardEvent } from 'react';
import { numericText } from '../numericText';
import { mapProject, compileNative } from './mapping';
import { useObjectTable } from '../store';
import { createCalculator } from '../formulas/engine';
import { useGridClipboard } from '../grid/useClipboard';
import { currentProject } from '../project';
import { generateMacros } from '../export';

it('converts Excel grouping spaces, full-width digits and accounting negatives without guessing malformed values', () => {
  for (const [text, value] of [['1,234', 1234], ['1\u00a0234', 1234], ['1\u202f234', 1234], ['１２，３４５', 12345], ['−1,234.5', -1234.5], ['(1,234)', -1234], [' +12.0 ', 12], ['1.2E3', 1200]] as const) expect(numericText(text)).toBe(value);
  for (const text of ['12,34', '1,2,3', '1 23', '(−1)', '1,234,56', '12%', '￥123', '1,23.45', '']) expect(numericText(text)).toBeUndefined();
});
it('actual external TSV paste into item priority and level compiles grouped integers, leaves source text and supports undo', () => {
  const project = mapProject({ path: '', fingerprint: '', strings: {}, raw: {}, imports: [], warnings: [], objects: { 'item:I001': { id: 'I001', parent: 'ratf', custom: true, fields: {} } } });
  useObjectTable.getState().restore(project);
  const sheet = useObjectTable.getState().sheets.item, errors: string[] = [];
  for (const name of ['prio', 'Level']) {
    const col = sheet.columns.findIndex(c => c.field === name);
    const paste = useGridClipboard('item', { start: { row: 0, col }, end: { row: 0, col } }, createCalculator(useObjectTable.getState().sheets), m => errors.push(m));
    paste.events.onPaste({ target: { tagName: 'DIV' }, preventDefault() {}, clipboardData: { getData: (type: string) => type === 'text/plain' ? '1,234\r\n' : '' } } as unknown as ClipboardEvent);
    expect(useObjectTable.getState().sheets.item.rows[0].cells[sheet.columns[col].key]).toBe('1,234');
  }
  expect(errors).toEqual([]);
  const result = compileNative(currentProject()); expect(result.issues).toEqual([]);
  expect(result.objects['item:I001'].fields['ipri:0:0'].value).toBe(1234);
  expect(result.objects['item:I001'].fields['ilev:0:0'].value).toBe(1234);
  expect(generateMacros(currentProject(), ['item'])[0].text).toContain("OBJ.prio = '1234'");
  expect(generateMacros(currentProject(), ['item'])[0].text).toContain("OBJ.Level = '1234'");
  useObjectTable.getState().undo();
  expect(compileNative(currentProject()).objects['item:I001'].fields['ilev:0:0']).toBeUndefined();
});
