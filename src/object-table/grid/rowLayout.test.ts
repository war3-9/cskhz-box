import { describe, expect, it } from 'vitest';
import { createCalculator } from '../formulas/engine';
import { createRowLayout } from './rowLayout';
import { HEADER_HEIGHT, ROW_HEIGHT } from './geometry';
import { useObjectTable } from '../store';

describe('多行表格布局与命中', () => {
  function setup() {
    const sheets = structuredClone(useObjectTable.getState().sheets);
    sheets.item.rows = [
      { id: 'a', cells: { 'item:D': '|cffff0000属性|n+10|r' } },
      { id: 'b', cells: { 'item:D': '甲\r\n乙\r丙\n丁' } },
      { id: 'c', cells: { 'item:D': '=D3' } },
    ];
    const calculator = createCalculator(sheets);
    return { sheet: sheets.item, read: (row: number, col: number) => calculator.read('item', row, col) };
  }
  it('按真实换行、War3换行及公式结果计算行高与连续偏移', () => {
    const { sheet, read } = setup(), layout = createRowLayout(sheet, new Set(), true, read);
    expect(layout.height(0)).toBe(ROW_HEIGHT + 18);
    expect(layout.height(1)).toBe(ROW_HEIGHT + 54);
    expect(layout.height(2)).toBe(ROW_HEIGHT + 18);
    expect(layout.top(0)).toBe(HEADER_HEIGHT);
    expect(layout.top(3)).toBe(HEADER_HEIGHT + ROW_HEIGHT * 3 + 90);
    expect(layout.height(10)).toBe(ROW_HEIGHT);
    expect(layout.top(10)).toBe(layout.top(3) + 7 * ROW_HEIGHT);
    expect(sheet.rows[0].cells['item:D']).toBe('|cffff0000属性|n+10|r');
  });
  it('折叠隐藏列高度，代码显示模式保留真实换行', () => {
    const { sheet, read } = setup();
    const hidden = createRowLayout(sheet, new Set(['item:D']), true, read);
    expect(hidden.height(0)).toBe(ROW_HEIGHT); expect(hidden.height(1)).toBe(ROW_HEIGHT);
    const raw = createRowLayout(sheet, new Set(), false, read);
    expect(raw.height(0)).toBe(ROW_HEIGHT); expect(raw.height(1)).toBe(ROW_HEIGHT + 54);
  });
  it('每个可变高度行的首尾命中同一行，空白行及深处定位一致', () => {
    const { sheet, read } = setup(), layout = createRowLayout(sheet, new Set(), true, read);
    for (const row of [0, 1, 2, 3, 30, 99999]) {
      expect(layout.rowAt(layout.top(row))).toBe(row);
      expect(layout.rowAt(layout.top(row) + layout.height(row) - 1)).toBe(row);
    }
    expect(layout.rowAt(-100)).toBe(0);
    expect(layout.rowAt(1e10)).toBe(99999);
  });
});
