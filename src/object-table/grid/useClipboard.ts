import type { ClipboardEvent } from 'react';
import type { CategoryId } from '../schema';
import { useObjectTable } from '../store';
import { clipboardType, decodeTsv, encodeTsv } from '../clipboard';
import { clipboardPayload, clipboardValues, readClipboardPayload } from '../clipboardPayload';
import { planPaste } from '../pastePlan';
import { bounds, type CellSelection } from './geometry';
import { columnNumber } from '../model';
import type { Calculator } from '../formulas/engine';
import { selectionMatrix } from './selection';
import { afterClipboardWrite, clipboardFromData, clipboardHtml, readGridClipboard, writeGridClipboard, writeInOrder, type GridClipboardData } from './systemClipboard';
const editing = (target: EventTarget) => ['INPUT', 'TEXTAREA'].includes((target as HTMLElement).tagName) || (target as HTMLElement).closest?.('[contenteditable="true"]');
export function clearSelection(id: CategoryId, selection: CellSelection) {
  const state = useObjectTable.getState(), sheet = state.sheets[id];
  const data = selectionMatrix(sheet, selection, new Set(state.views[id].hiddenColumns ?? []));
  state.paste(id, 0, { base: sheet, columns: sheet.columns, targets: data.cols, rows: data.rows, mask: data.mask, matrix: data.raw.map(row => row.map(() => '')) });
}
export function useGridClipboard(id: CategoryId, selection: CellSelection, calculator: Calculator, report: (message: string, kind?: 'success' | 'error') => void) {
  const prepare = () => {
    const sheet = useObjectTable.getState().sheets[id];
    const hidden = new Set(useObjectTable.getState().views[id].hiddenColumns ?? []);
    const data = selectionMatrix(sheet, selection, hidden), { raw, fullRows } = data;
    const columns = data.cols.map(c => sheet.columns[c]);
    if (!columns.length) throw new Error('请先选择要复制的单元格');
    calculator.resetBudget();
    const display = data.rows.map((r, ri) => columns.map((c, ci) => data.mask[ri][ci] ? calculator.read(id, r + 3, columnNumber(c.letter)).text : ''));
    return { sheet, clear: { base: sheet, columns: sheet.columns, targets: data.cols, rows: data.rows, mask: data.mask, matrix: raw.map(row => row.map(() => '')) }, text: encodeTsv(display), payload: clipboardPayload(id, sheet, columns, raw, data.rows[0] + 3, fullRows, { rows: data.rows.map(r => r + 3), mask: data.mask, values: display }) };
  };
  const apply = (data: GridClipboardData, valuesOnly = false) => {
      if (selection.ranges?.length) throw new Error('粘贴时请选择一个起始单元格或连续区域');
      const b = bounds(selection), sheet = useObjectTable.getState().sheets[id], custom = data.payload;
      const payload = custom ? readClipboardPayload(custom) : undefined;
      const matrix = valuesOnly ? clipboardValues(data.text, id, payload?.origin) : payload?.origin.raw ?? decodeTsv(data.text);
      const hidden = useObjectTable.getState().views[id].hiddenColumns ?? [];
      const plan = planPaste(id, sheet, hidden, b.r1, b.c1, matrix, payload?.origin, payload?.records);
      useObjectTable.getState().paste(id, b.r1, plan);
      if (payload?.records) report(`已按物编字段${valuesOnly ? '粘贴为值' : '粘贴'} ${matrix.length} 行，补齐 ${plan.columns.length - sheet.columns.length} 列；可一次撤销`, 'success');
      else if (valuesOnly) report('已粘贴为值，可一次撤销', 'success');
  };
  const failure = (error: unknown) => report(error instanceof Error ? error.message : String(error), 'error');
  const copyToClipboard = (cut = false) => {
    try {
      const data = prepare();
      return writeInOrder(async () => {
        await writeGridClipboard(data);
        if (cut) {
          if (useObjectTable.getState().sheets[id] !== data.sheet) throw new Error('复制成功，但表格已变化，未清除剪切源数据，请重新剪切');
          useObjectTable.getState().paste(id, 0, data.clear);
        }
        report(cut ? '已剪切，可用 Ctrl+V 粘贴' : '已复制，可用 Ctrl+V 按字段粘贴', 'success');
      }).catch(error => { failure(new Error(`复制／剪切失败：${String(error)}`)); });
    } catch (error) { failure(error); return Promise.resolve(); }
  };
  const pasteFromClipboard = async (valuesOnly = false) => {
    const bookId = useObjectTable.getState().bookId;
    try {
      await afterClipboardWrite();
      if (useObjectTable.getState().bookId !== bookId) throw new Error('读取剪贴板时任务已切换，请重新粘贴');
      const sheet = useObjectTable.getState().sheets[id];
      const data = await readGridClipboard();
      if (useObjectTable.getState().sheets[id] !== sheet) throw new Error('读取剪贴板时表格已变化，请重新粘贴');
      apply(data, valuesOnly);
    } catch (error) { failure(error); }
  };
  const copy = (event: ClipboardEvent) => {
    if (editing(event.target)) return;
    event.preventDefault(); event.stopPropagation?.();
    try {
      const data = prepare();
      event.clipboardData.setData('text/plain', data.text);
      event.clipboardData.setData('text/html', clipboardHtml(data));
      event.clipboardData.setData(clipboardType, data.payload);
    } catch (error) { failure(error); }
  };
  const paste = (event: ClipboardEvent) => {
    if (editing(event.target)) return;
    event.preventDefault(); event.stopPropagation?.();
    try { apply(clipboardFromData(event.clipboardData)); } catch (error) { failure(error); }
  };
  return { copyToClipboard, pasteFromClipboard, events: { onCopy: copy, onCut: (e: ClipboardEvent) => {
    if (editing(e.target)) return;
    e.preventDefault(); e.stopPropagation?.(); return copyToClipboard(true);
  }, onPaste: paste } };
}
