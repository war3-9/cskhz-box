import { columnLetter, MAX_ROWS, type Sheet } from './model';
import type { CategoryId, ObjectColumn } from './schema';
import { shiftFormula } from './formulas/references';
import { MAX_CLIPBOARD_CELLS, matrixWidth, type ClipboardOrigin, type RecordClipboard } from './clipboardPayload';
import { recordFormula } from './recordFormula';

export interface PastePlan { base: Sheet; columns: ObjectColumn[]; targets: number[]; matrix: string[][]; mask?: boolean[][]; rows?: number[] }
export function planPaste(category: CategoryId, sheet: Sheet, hidden: string[], row: number, col: number, matrix: string[][], origin?: ClipboardOrigin, records?: RecordClipboard): PastePlan {
  const width = matrixWidth(matrix);
  if (row < 0 || row + matrix.length > MAX_ROWS) throw new Error('粘贴范围超过 100000 行');
  if (width * matrix.length > MAX_CLIPBOARD_CELLS) throw new Error('粘贴区域超过 20 万格，请分批复制');
  if (records) {
    if (records.category !== category) throw new Error('物编字段只能粘贴到相同类别，请切换到对应表格；跨类别可通过文本编辑框复制纯文本');
    const columns = [...sheet.columns], counts = new Map<string, number>(), byField = new Map<string, number[]>();
    columns.forEach((column, index) => { if (index < 2) return; const list = byField.get(column.field) ?? []; list.push(index); byField.set(column.field, list); });
    const sourceCounts = new Map<string, number>();
    records.columns.forEach((column, i) => { if ((records.cols?.[i] ?? i + 2) >= 4) sourceCounts.set(column.field, (sourceCounts.get(column.field) ?? 0) + 1); });
    for (const [field, count] of sourceCounts) if ((byField.get(field)?.length ?? 0) > count) throw new Error(`目标表字段「${field}」的重复列多于源表，无法安全确定生效列，已取消粘贴`);
    const targets = records.columns.map((source, sourceIndex) => {
      // B/C identify ID/template by their fixed project roles, even in imported workbooks with different field aliases.
      const sourceCol = records.cols?.[sourceIndex] ?? sourceIndex + 2;
      if (sourceCol < 4) return sourceCol - 2;
      const occurrence = counts.get(source.field) ?? 0; counts.set(source.field, occurrence + 1);
      const existing = byField.get(source.field)?.[occurrence];
      if (existing !== undefined) return existing;
      if (columns.length >= 512) throw new Error('补齐物编字段后超过 512 列，已取消粘贴，原数据未修改');
      const index = columns.length, letter = columnLetter(index + 2);
      columns.push({ ...source, letter, key: `${category}:${letter}` });
      const list = byField.get(source.field) ?? []; list.push(index); byField.set(source.field, list);
      return index;
    });
    return { base: sheet, columns, targets, mask: origin?.mask, matrix: matrix.map((values, offset) => values.map((raw, i) => {
      const delta = row + offset + 3 - (records.rows?.[offset] ?? records.row + offset);
      return records.fullRows ? recordFormula(raw, delta, targets, records.sheetName, sheet.name)
        : shiftFormula(raw, delta, targets[i] + 2 - records.cols![i]);
    })) };
  }
  const hiddenSet = new Set(hidden);
  const available = sheet.columns.flatMap((column, index) => index >= col && !hiddenSet.has(column.key) ? [index] : []);
  if (width > available.length) throw new Error(`复制内容有 ${width} 列，从当前起点向右仅有 ${available.length} 个未隐藏列。请从更靠左的列粘贴、取消隐藏，或缩小复制范围（尾部空列也计入）`);
  const targets = available.slice(0, width);
  return { base: sheet, columns: sheet.columns, targets, mask: origin?.mask, matrix: matrix.map((values, offset) => values.map((raw, index) => origin
    ? shiftFormula(raw, row + offset + 3 - (origin.rows?.[offset] ?? origin.row + offset), targets[index] + 2 - (origin.cols?.[index] ?? origin.col + index)) : raw)) };
}

/** Prepare every change before publishing one undoable book transition. */
export function applyPaste(sheet: Sheet, row: number, plan: PastePlan): Sheet {
  if (sheet !== plan.base) throw new Error('表格已变化，请重新粘贴');
  const rows = [...sheet.rows]; let changed = plan.columns.length !== sheet.columns.length;
  plan.matrix.forEach((values, offset) => {
    const index = plan.rows?.[offset] ?? row + offset;
    if (!rows[index] && values.every(value => value === '')) return;
    while (rows.length <= index) rows.push({ id: crypto.randomUUID(), cells: {} });
    const cells = { ...rows[index].cells };
    values.forEach((value, i) => {
      if (plan.mask && !plan.mask[offset][i]) return;
      const key = plan.columns[plan.targets[i]].key;
      if ((cells[key] ?? '') === value) return;
      changed = true; if (value === '') delete cells[key]; else cells[key] = value;
    });
    rows[index] = { ...rows[index], cells };
  });
  return changed ? { ...sheet, columns: plan.columns, rows, past: [...sheet.past.slice(-79), sheet.rows], future: [] } : sheet;
}
