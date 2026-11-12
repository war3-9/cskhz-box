import { useObjectTable } from '../store';
import { categoryById, type CategoryId } from '../schema';
export interface PaletteTarget { token: string; book: string; category: CategoryId; row: number; rowId?: string; key: string; raw: string; title: string }
export interface PaletteDraft { target: PaletteTarget; value: string }
export function paletteTarget(category: CategoryId, row: number, col: number): PaletteTarget {
  const s = useObjectTable.getState(), sheet = s.sheets[category], column = sheet.columns[col];
  return { token: crypto.randomUUID(), book: s.bookId, category, row, rowId: sheet.rows[row]?.id, key: column.key, raw: sheet.rows[row]?.cells[column.key] ?? '', title: `${categoryById[category].title} · 第 ${row + 3} 行 · ${column.title}` };
}
export function applyPaletteDraft(draft: PaletteDraft): PaletteTarget {
  const { target, value } = draft, s = useObjectTable.getState();
  if (target.book !== s.bookId) throw new Error('工作簿已更换，请双击目标单元格重新打开。文案仍保留在色板中。');
  const sheet = s.sheets[target.category], row = target.rowId ? sheet.rows.findIndex(r => r.id === target.rowId) : target.row;
  const col = sheet.columns.findIndex(c => c.key === target.key);
  if (row < 0 || col < 0) throw new Error('原行或字段已删除，文案仍保留在色板中。');
  const current = sheet.rows[row]?.cells[target.key] ?? '';
  if (current !== target.raw && current !== value) throw new Error('该单元格已在表格中修改，请先保留色板文案，再重新打开目标单元格。');
  if (current !== value) s.write(target.category, row, col, [[value]]);
  return { ...target, row, raw: value, rowId: useObjectTable.getState().sheets[target.category].rows[row]?.id, title: `${categoryById[target.category].title} · 第 ${row + 3} 行 · ${sheet.columns[col].title}` };
}
