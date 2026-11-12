import FormulaParser from 'fast-formula-parser';
import { categories } from '../schema';
import { columnLetter, columnNumber, isStandardSheet, type SheetData } from '../model';

export interface CellResult { text: string; value: string | number | boolean | null; error?: string }
type Book = Record<string, SheetData>;
const literal = (raw: string): CellResult => {
  if (raw.startsWith("'")) return { text: raw.slice(1), value: raw.slice(1) };
  if (raw === '') return { text: '', value: null };
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(raw) && Number.isFinite(Number(raw))) return { text: raw, value: Number(raw) };
  return { text: raw, value: raw };
};
export function createCalculator(sheets: Book) {
  const cache = new Map<string, CellResult>(), visiting = new Set<string>();
  const names = new Map<string, string>(), columns = new Map<string, Map<number, SheetData['columns'][number]>>();
  for (const { id, title } of categories) { names.set(id.toLowerCase(), id); names.set(title.toLowerCase(), id); }
  for (const [id, sheet] of Object.entries(sheets)) {
    names.set(sheet.name.toLowerCase(), id);
    columns.set(id, new Map(sheet.columns.map(column => [columnNumber(column.letter), column])));
  }
  // Nested references must use a different parser: parse() mutates its token stream.
  // Sequential formulas at the same depth can safely reuse that parser.
  const parsers: { category: string; parser: FormulaParser }[] = [];
  let budget = 0;
  const findSheet = (name: string) => names.get(name.toLowerCase());
  const getRaw = (id: string, row: number, col: number): string => {
    const sheet = sheets[id], column = columns.get(id)?.get(col);
    if (row === 1 && column) return column.title;
    if (row === 2 && column) return column.field.startsWith('__blank_') ? '' : column.field;
    if (row >= 3 && column) return sheet.rows[row - 3]?.cells[column.key] ?? '';
    return sheet.auxiliary[`${columnLetter(col)}${row}`] ?? '';
  };
  const read = (id: string, row: number, col: number): CellResult => {
    const key = `${id}!${row}:${col}`, cached = cache.get(key);
    if (cached) return cached;
    if (visiting.has(key)) return { value: null, text: '#CYCLE!', error: '公式存在循环引用' };
    const raw = getRaw(id, row, col);
    if (!isStandardSheet(id) || !raw.startsWith('=')) return literal(raw);
    if (visiting.size >= 128 || ++budget > 200000) return { value: null, text: '#LIMIT!', error: '公式计算超过范围或递归限制' };
    visiting.add(key);
    let result: CellResult;
    try {
      const depth = visiting.size - 1;
      let slot = parsers[depth];
      if (!slot) {
        const context = { category: id };
        const reference = (ref: { sheet?: string; row: number; col: number }) => {
          const target = ref.sheet ? findSheet(ref.sheet) : context.category;
          if (!target || ref.row < 1 || ref.col < 1) throw new Error('#REF! 工作表或单元格不存在');
          const result = read(target, ref.row, ref.col);
          if (result.error) throw new Error(`${result.text} ${result.error}`);
          return result.value;
        };
        const parser = new FormulaParser({
          onCell: reference,
          onRange: ref => {
            const count = (ref.to.row - ref.from.row + 1) * (ref.to.col - ref.from.col + 1);
            if (count > 50000 || count < 0) throw new Error('#LIMIT! 公式范围过大');
            return Array.from({ length: ref.to.row - ref.from.row + 1 }, (_, row) => Array.from({ length: ref.to.col - ref.from.col + 1 }, (_, col) => reference({ sheet: ref.sheet, row: ref.from.row + row, col: ref.from.col + col })));
          },
        });
        slot = parsers[depth] = Object.assign(context, { parser });
      }
      slot.category = id;
      const parsed = slot.parser.parse(raw.slice(1), { sheet: sheets[id].name, row, col });
      const value = parsed === null ? 0 : parsed;
      if (value instanceof Error) throw value;
      if (value !== null && !['number', 'string', 'boolean'].includes(typeof value)) throw new Error('不支持数组或空结果公式');
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('#NUM! 数值无效');
      result = { value: value as CellResult['value'], text: value === null ? '' : typeof value === 'boolean' ? value ? 'True' : 'False' : String(value) };
    } catch (error) {
      const message = String(error), match = message.match(/#[A-Z0-9/]+[!?]/);
      result = { value: null, text: match?.[0] ?? '#ERROR!', error: message };
    } finally { visiting.delete(key); }
    cache.set(key, result); return result;
  };
  return { read, raw: getRaw, resetBudget: () => { budget = 0; } };
}
export type Calculator = ReturnType<typeof createCalculator>;
