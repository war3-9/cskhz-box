import { tokenize, type Token } from 'excel-formula-tokenizer';
import { columnLetter, columnNumber } from '../model';

function render(token: Token, change: (value: string) => string): string {
  if (token.type === 'operand' && token.subtype === 'text') return `"${token.value.replaceAll('"', '""')}"`;
  if (token.type === 'operand' && token.subtype === 'range') return change(token.value);
  if (token.type === 'function') return token.subtype === 'start' ? `${token.value}(` : ')';
  if (token.type === 'subexpression') return token.subtype === 'start' ? '(' : ')';
  if (token.type === 'argument') return ',';
  if (token.type === 'white-space') return ' ';
  return token.value;
}
export function mapFormulaReferences(formula: string, change: (ref: string) => string): string {
  if (!formula.startsWith('=')) return formula;
  return '=' + tokenize(formula).map(token => render(token, change)).join('');
}
export function shiftFormula(formula: string, rows: number, columns: number): string {
  return mapFormulaReferences(formula, ref => {
    const bang = ref.lastIndexOf('!'), sheet = bang < 0 ? '' : ref.slice(0, bang);
    const prefix = sheet ? sheet + '!' : '';
    const address = bang < 0 ? ref : ref.slice(bang + 1);
    if (!/^\$?[A-Z]{1,3}\$?[1-9]\d*(?::\$?[A-Z]{1,3}\$?[1-9]\d*)?$/i.test(address)) return ref;
    return prefix + address.replace(/(\$?)([A-Z]{1,3})(\$?)([1-9]\d*)/gi, (_all, fixedCol: string, col: string, fixedRow: string, row: string) => {
      const nextRow = Number(row) + (fixedRow ? 0 : rows), nextCol = columnNumber(col.toUpperCase()) + (fixedCol ? 0 : columns);
      return nextRow < 1 || nextCol < 1 || nextRow > 1048576 || nextCol > 16384 ? '#REF!' : `${fixedCol}${columnLetter(nextCol)}${fixedRow}${nextRow}`;
    });
  });
}

export function rebaseImportedColumns(formula: string, currentSheet: string, shiftedSheets: ReadonlySet<string>): string {
  let changed = false;
  const result = mapFormulaReferences(formula, ref => {
    const bang = ref.lastIndexOf('!');
    const sheet = bang < 0 ? currentSheet : ref.slice(0, bang).replace(/^'|'$/g, '').replaceAll("''", "'");
    if (!shiftedSheets.has(sheet.toLowerCase())) return ref;
    const prefix = bang < 0 ? '' : ref.slice(0, bang + 1);
    const address = bang < 0 ? ref : ref.slice(bang + 1);
    if (!/^\$?[A-Z]{1,3}\$?[1-9]\d*(?::\$?[A-Z]{1,3}\$?[1-9]\d*)?$/i.test(address)) return ref;
    changed = true;
    return prefix + address.replace(/(\$?)([A-Z]{1,3})(\$?[1-9]\d*)/gi, (_all, fixed: string, col: string, row: string) => {
      const next = columnNumber(col.toUpperCase()) + 1;
      return next > 16384 ? '#REF!' : `${fixed}${columnLetter(next)}${row}`;
    });
  });
  return changed ? result : formula;
}

export function spliceReferences(formula: string, local: string[], target: string[], at: number, delta: number) {
  return mapFormulaReferences(formula, ref => {
    const bang = ref.lastIndexOf('!'), prefix = bang < 0 ? '' : ref.slice(0, bang + 1);
    const sheet = bang < 0 ? local[0] : ref.slice(0, bang).replace(/^'|'$/g, '').replaceAll("''", "'");
    if (!target.some(name => name.toLowerCase() === sheet.toLowerCase())) return ref;
    const address = bang < 0 ? ref : ref.slice(bang + 1);
    if (!/^\$?[A-Z]{1,3}\$?[1-9]\d*(?::\$?[A-Z]{1,3}\$?[1-9]\d*)?$/i.test(address)) return ref;
    const endpoints = [...address.matchAll(/\$?[A-Z]{1,3}\$?([1-9]\d*)/gi)].map(m => Number(m[1]));
    const low = Math.min(...endpoints), high = Math.max(...endpoints);
    const deletedEnd = at - delta - 1;
    if (delta < 0 && low >= at && high <= deletedEnd) return '#REF!';
    return prefix + address.replace(/(\$?[A-Z]{1,3}\$?)([1-9]\d*)/gi, (_all, column: string, r: string) => {
      const row = Number(r);
      if (delta < 0 && row >= at && row <= deletedEnd) return column + (row === low ? at : at - 1);
      return column + (row >= at ? row + delta : row);
    });
  });
}
