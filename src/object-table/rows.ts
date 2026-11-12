import { categories } from './schema';
import { emptyRow, isStandardSheet, type Sheets } from './model';
import { spliceReferences } from './formulas/references';

export function spliceRows(sheets: Sheets, id: string, index: number, delta: number): Sheets {
  if (!isStandardSheet(id)) {
    const sheet = sheets[id], rows = [...sheet.rows];
    rows.splice(index, delta < 0 ? -delta : 0, ...(delta > 0 ? Array.from({ length: delta }, emptyRow) : []));
    return { ...sheets, [id]: { ...sheet, rows, past: [...sheet.past.slice(-79), sheet.rows], future: [] } };
  }
  const target = [sheets[id].name, id, categories.find(c => c.id === id)!.title];
  return { ...sheets, ...Object.fromEntries(categories.map(category => {
    const sheet = sheets[category.id], local = [sheet.name, category.id, category.title];
    const change = (value: string) => value.startsWith('=') ? spliceReferences(value, local, target, index + 3, delta) : value;
    let rows = sheet.rows.map(row => {
      const entries = Object.entries(row.cells).map(([key, value]) => [key, change(value)]);
      return entries.some(([key, value]) => row.cells[key] !== value) ? { ...row, cells: Object.fromEntries(entries) } : row;
    });
    const auxiliary: Record<string, string> = {};
    for (const [address, value] of Object.entries(sheet.auxiliary)) {
      const m = address.match(/^([A-Z]+)(\d+)$/);
      if (category.id !== id || !m || Number(m[2]) < index + 3) auxiliary[address] = change(value);
      else if (delta > 0 || Number(m[2]) >= index + 3 - delta) auxiliary[m[1] + (Number(m[2]) + delta)] = change(value);
    }
    if (category.id === id) rows.splice(index, delta < 0 ? -delta : 0, ...(delta > 0 ? Array.from({ length: delta }, emptyRow) : []));
    if (category.id !== id && rows.every((r, i) => r === sheet.rows[i]) && Object.keys(auxiliary).every(key => auxiliary[key] === sheet.auxiliary[key])) return [category.id, sheet];
    return [category.id, { ...sheet, rows, auxiliary, past: [...sheet.past.slice(-79), sheet.rows], future: [] }];
  })) } as Sheets;
}
