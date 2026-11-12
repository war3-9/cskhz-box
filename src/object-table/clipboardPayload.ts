import { z } from 'zod';
import type { CategoryId, ObjectColumn } from './schema';
import { columnNumber, isStandardSheet, type Sheet } from './model';
import { decodeTsv } from './clipboard';

export const MAX_CLIPBOARD_CELLS = 200000;
export const matrixWidth = (matrix: string[][]) => matrix.reduce((width, row) => Math.max(width, row.length), 0);
const originSchema = z.object({
  raw: z.array(z.array(z.string()).max(16384)).max(100000),
  values: z.array(z.array(z.string()).max(16384)).max(100000).optional(),
  row: z.number().int().min(1).max(1048576), col: z.number().int().min(1).max(16384),
  cols: z.array(z.number().int().min(1).max(16384)).max(16384).optional(),
  rows: z.array(z.number().int().min(1).max(1048576)).max(100000).optional(),
  mask: z.array(z.array(z.boolean()).max(16384)).max(100000).optional(),
});
const recordsSchema = z.object({
  version: z.literal(2), fullRows: z.literal(true),
  category: z.enum(['item', 'unit', 'ability', 'upgrade', 'doodad', 'buff']),
  sheetName: z.string().min(1),
  columns: z.array(z.object({ field: z.string(), title: z.string(), width: z.number().finite().min(48).max(4000) })).min(1).max(512),
});
const fieldsSchema = recordsSchema.extend({ version: z.literal(3), fullRows: z.boolean(), columns: recordsSchema.shape.columns.min(1) });
export type ClipboardOrigin = z.infer<typeof originSchema>;
export type RecordClipboard = ClipboardOrigin & (z.infer<typeof recordsSchema> | z.infer<typeof fieldsSchema>);
export function readClipboardPayload(text: string): { origin: ClipboardOrigin; records?: RecordClipboard } {
  const value: unknown = JSON.parse(text), origin = originSchema.parse(value);
  const width = matrixWidth(origin.raw);
  if (width * origin.raw.length > MAX_CLIPBOARD_CELLS) throw new Error('粘贴区域超过 20 万格，请分批复制');
  if (origin.cols && (origin.cols.length !== width || origin.cols.some((col, index, cols) => index > 0 && col <= cols[index - 1]))) throw new Error('剪贴板列信息无效，请重新复制');
  if (origin.rows && (origin.rows.length !== origin.raw.length || origin.rows.some((row, i, rows) => i > 0 && row <= rows[i - 1]))) throw new Error('剪贴板行信息无效，请重新复制');
  if (origin.mask && (origin.mask.length !== origin.raw.length || origin.mask.some(row => row.length !== width))) throw new Error('剪贴板选区信息无效，请重新复制');
  if (origin.values && (origin.values.length !== origin.raw.length || origin.values.some(row => row.length !== width))) throw new Error('剪贴板显示值信息不完整，请重新复制');
  if (typeof value === 'object' && value && (('version' in value && value.version === 3) || ('fullRows' in value && value.fullRows === true))) {
    const records = { ...origin, ...('version' in value && value.version === 3 ? fieldsSchema : recordsSchema).parse(value) };
    if (records.columns.length !== width || origin.raw.some(row => row.length !== width) || !origin.cols
      || origin.cols[0] !== origin.col || origin.cols.some(col => col < 2 || col > 513)
      || (records.fullRows && (origin.col !== 2 || origin.cols.some((col, index) => col !== index + 2)))) throw new Error('剪贴板字段信息不完整，请重新复制');
    return { origin, records };
  }
  return { origin };
}
export function clipboardPayload(category: CategoryId, sheet: Sheet, columns: ObjectColumn[], raw: string[][], row: number, fullRows: boolean, extra?: Pick<ClipboardOrigin, 'rows' | 'mask' | 'values'>) {
  return JSON.stringify({ raw, row, col: columnNumber(columns[0].letter), cols: columns.map(c => columnNumber(c.letter)), ...extra,
    ...(isStandardSheet(category) ? { version: 3, fullRows, category, sheetName: sheet.name, columns: columns.map(({ field, title, width }) => ({ field, title, width })) } : {}) });
}

/** Values are captured at copy time. Never recalculate against the destination. */
export function clipboardValues(text: string, category: CategoryId, origin?: ClipboardOrigin) {
  const values = origin?.values ?? decodeTsv(text);
  const width = origin ? matrixWidth(origin.raw) : 0;
  if (origin && (values.length !== origin.raw.length || values.some(row => row.length !== width))) throw new Error('剪贴板显示值与选区不匹配，请重新复制后粘贴为值');
  // Keep results beginning with '=' or an apostrophe as literal text in formula-enabled sheets.
  return values.map(row => row.map(value => isStandardSheet(category) && /^[=']/.test(value) ? `'${value}` : value));
}
