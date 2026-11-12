import { columnLetter, columnNumber } from './model';
import { mapFormulaReferences, shiftFormula } from './formulas/references';

/** Whole records follow field identities, including absolute/local references. */
export function recordFormula(raw: string, rowDelta: number, targets: number[], sourceName: string, targetName: string) {
  const moved = shiftFormula(raw, rowDelta, 0);
  return mapFormulaReferences(moved, ref => {
    const bang = ref.lastIndexOf('!'), prefix = bang < 0 ? '' : ref.slice(0, bang + 1);
    const name = bang < 0 ? sourceName : ref.slice(0, bang).replace(/^'|'$/g, '').replaceAll("''", "'");
    if (name.toLowerCase() !== sourceName.toLowerCase()) return ref;
    const address = bang < 0 ? ref : ref.slice(bang + 1);
    if (!/^\$?[A-Z]{1,3}\$?[1-9]\d*(?::\$?[A-Z]{1,3}\$?[1-9]\d*)?$/i.test(address)) return ref;
    const map = (number: number) => {
      if (number === 1) return 1;
      const target = targets[number - 2];
      if (target === undefined) throw new Error('整行公式引用了未复制的辅助列，无法安全迁移，请先改为数值或复制完整字段');
      return target + 2;
    };
    const cols = [...address.matchAll(/\$?([A-Z]{1,3})\$?[1-9]\d*/gi)].map(m => columnNumber(m[1].toUpperCase()));
    if (cols.length === 2) {
      const low = Math.min(...cols), high = Math.max(...cols), first = map(low);
      for (let col = low; col <= high; col++) if (map(col) !== first + col - low) throw new Error('整行公式的引用范围在目标表中不连续，已取消粘贴，原数据未修改');
    }
    const targetPrefix = prefix ? `'${targetName.replaceAll("'", "''")}'!` : '';
    return targetPrefix + address.replace(/(\$?)([A-Z]{1,3})(\$?[1-9]\d*)/gi,
      (_all, fixed: string, col: string, row: string) => fixed + columnLetter(map(columnNumber(col.toUpperCase()))) + row);
  });
}
