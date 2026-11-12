import type { FileEntry } from '@zip.js/zip.js';
import { categories, type CategoryId, type ObjectColumn } from '../schema';
import { columnNumber, columnLetter, MAX_ROWS, type SheetData } from '../model';
import { shiftFormula } from '../formulas/references';
import { xmlEntry, xmlParser, tagName, excelText } from './xml';

export async function readSheet(entry: FileEntry, name: string, strings: string[], progress: (n: number, total: number) => void): Promise<{ id: CategoryId | null; sheet: SheetData; shifted: boolean } | null> {
  const cells = new Map<string, string>(), shared = new Map<string, { address: string; formula: string }>();
  const formulaCaches = new Map<string, { value: string; text: boolean }>();
  const followers: { address: string; si: string }[] = [];
  const emptyFormulas: string[] = [];
  let address = '', type = '', value = '', formula = '', si = '', inValue = false, inText = false, inFormula = false, hasFormula = false;
  let phonetic = false;
  const parser = xmlParser();
  parser.on('opentag', tag => {
    const n = tagName(tag.name);
    if (n === 'rPh') phonetic = true;
    if (n === 'c') { address = String(tag.attributes.r ?? ''); type = String(tag.attributes.t ?? ''); value = ''; formula = ''; si = ''; hasFormula = false; }
    if (n === 'v') inValue = true;
    if (n === 't') inText = true;
    if (n === 'f') { inFormula = true; hasFormula = true; si = String(tag.attributes.si ?? ''); }
  });
  parser.on('text', text => { if (!phonetic) { if (inFormula) formula += text; else if (inValue || inText) value += text; } });
  parser.on('closetag', raw => {
    const n = tagName(raw.name);
    if (n === 'rPh') phonetic = false;
    if (n === 'v') inValue = false;
    if (n === 't') inText = false;
    if (n === 'f') inFormula = false;
    if (n !== 'c' || !/^[A-Z]+[1-9]\d*$/.test(address)) return;
    if (hasFormula) {
      if (value !== '') {
        const cached = type === 'b' ? value === '1' ? 'True' : 'False' : ['str', 'inlineStr'].includes(type) ? excelText(value) : value;
        formulaCaches.set(address, { value: cached, text: ['str', 'inlineStr', 'e'].includes(type) });
      }
      if (formula) { cells.set(address, '=' + formula); if (si) shared.set(si, { address, formula: '=' + formula }); }
      else if (si) followers.push({ address, si });
      else emptyFormulas.push(address);
    } else {
      if (value === '') return;
      const decoded = type === 's' ? strings[Number(value)] : type === 'b' ? value === '1' ? 'True' : 'False' : ['inlineStr', 'str'].includes(type) ? excelText(value) : value;
      if (decoded === undefined) throw new Error(`${name}!${address}：共享文本索引无效`);
      if (decoded !== '') {
        const row = Number(address.match(/\d+$/)![0]);
        const stringLiteral = row >= 3 && ['s', 'inlineStr', 'str'].includes(type) && /^(?:[='\-+\d]|true$|false$)/i.test(decoded);
        cells.set(address, type === 'e' ? '=' + decoded : stringLiteral ? "'" + decoded : decoded);
      }
    }
    if (cells.size > 3000000) throw new Error('有效单元格超过 300 万限制');
  });
  await xmlEntry(entry, parser, progress);
  const standard = categories.find(category => category.id === cells.get('C2'))?.id;
  const firstColumn = !standard && /^自定义\s*ID$/i.test(cells.get('A1')?.trim() ?? '') && cells.get('B1')?.trim() === '模板'
    ? categories.find(category => category.id === cells.get('B2'))?.id : undefined;
  const id = standard ?? firstColumn;
  const shift = firstColumn ? 1 : 0;
  const cachedValue = (address: string) => {
    const cached = formulaCaches.get(address);
    return cached && cached.text && /^(?:[='\-+\d]|true$|false$)/i.test(cached.value) ? "'" + cached.value : cached?.value;
  };
  if (id && emptyFormulas.length) throw new Error(`${name}!${emptyFormulas[0]}：不支持缺少内容的公式`);
  for (const follower of followers) {
    const master = shared.get(follower.si);
    if (!master) {
      if (id) throw new Error(`${name}!${follower.address}：共享公式缺少主公式`);
      const cached = cachedValue(follower.address);
      if (cached !== undefined) cells.set(follower.address, cached);
      continue;
    }
    const parts = (a: string) => { const m = a.match(/^([A-Z]+)(\d+)$/)!; return [columnNumber(m[1]), Number(m[2])]; };
    const [c, r] = parts(follower.address), [mc, mr] = parts(master.address);
    cells.set(follower.address, shiftFormula(master.formula, r - mr, c - mc));
  }
  if (!id) {
    for (const [address, formula] of [...cells]) {
      if (!formula.startsWith('=')) continue;
      const cached = cachedValue(address);
      cells.set(address, cached === undefined ? `'${formula}` : cached);
    }
    for (const address of emptyFormulas) {
      const cached = cachedValue(address);
      if (cached !== undefined) cells.set(address, cached);
    }
  }
  if (!id) {
    if (!cells.size) return null;
    const positions = [...cells.keys()].map(address => {
      const match = address.match(/^([A-Z]+)(\d+)$/)!;
      return { col: columnNumber(match[1]), row: Number(match[2]) };
    });
    const firstCol = Math.min(...positions.map(cell => cell.col)), lastCol = Math.max(...positions.map(cell => cell.col));
    const lastRow = Math.max(...positions.map(cell => cell.row));
    if (lastCol - firstCol + 1 > 512) throw new Error(`${name}：自定义表格超过 512 列`);
    if (lastRow > MAX_ROWS) throw new Error(`${name}：自定义表格超过 100000 行`);
    const columns: ObjectColumn[] = Array.from({ length: lastCol - firstCol + 1 }, (_, offset) => {
      const letter = columnLetter(firstCol + offset);
      return { key: `custom:${letter}`, letter, title: letter, field: '', width: 154 };
    });
    const rows: SheetData['rows'] = Array.from({ length: lastRow }, () => ({ id: crypto.randomUUID(), cells: {} }));
    const keys = new Map(columns.map(column => [column.letter, column.key]));
    for (const [address, value] of cells) {
      const match = address.match(/^([A-Z]+)(\d+)$/)!, key = keys.get(match[1]);
      if (key) rows[Number(match[2]) - 1].cells[key] = value;
    }
    return { id: null, sheet: { name, columns, rows, auxiliary: {} }, shifted: false };
  }
  let lastCol = 3;
  for (const [address] of cells) { const m = address.match(/^([A-Z]+)([12])$/); if (m) lastCol = Math.max(lastCol, columnNumber(m[1]) + shift); }
  if (lastCol > 513) throw new Error(`${name}：表头超过 512 列`);
  const columns: ObjectColumn[] = [];
  for (let col = 2; col <= lastCol; col++) {
    const letter = columnLetter(col), source = columnLetter(col - shift);
    const title = cells.get(`${source}1`) ?? '', field = cells.get(`${source}2`) ?? '';
    // Blank header positions are kept as independent columns; they are never exported as attributes.
    columns.push({ key: `${id}:${letter}`, letter, title, field, width: col === 2 ? 120 : col === 3 ? 112 : /说明|提示/.test(title) ? 224 : 154 });
  }
  const auxiliary: Record<string, string> = {}, rows: SheetData['rows'] = [];
  const keys = new Map(columns.map(c => [c.letter, c.key]));
  for (const [address, value] of cells) {
    const m = address.match(/^([A-Z]+)(\d+)$/)!, row = Number(m[2]);
    const letter = columnLetter(columnNumber(m[1]) + shift), key = keys.get(letter);
    if (row >= 3 && key) {
      if (row - 2 > MAX_ROWS) throw new Error(`${name}!${address}：数据超过 100000 行`);
      while (rows.length <= row - 3) rows.push({ id: crypto.randomUUID(), cells: {} });
      rows[row - 3].cells[key] = value;
    } else if (!key || row > 2) auxiliary[`${letter}${row}`] = value;
  }
  return { id, sheet: { name, columns, rows, auxiliary }, shifted: !!shift };
}
