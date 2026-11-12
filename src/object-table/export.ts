import { categories, type CategoryId } from './schema';
import { columnNumber, type ObjectProject } from './model';
import { createCalculator } from './formulas/engine';
import { escapedRawcode } from './native/rawcode';
import { resolveField } from './native/metadata';
import { numericText } from './numericText';

export class ObjectExportError extends Error {
  constructor(message: string, public category: CategoryId, public row: number, public col: number) { super(message); }
}
const luaString = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/[\x00-\x1f\x7f]/g, c => `\\${c.charCodeAt(0).toString().padStart(3, '0')}`)}'`;
const reserved = new Set('and break do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(' '));
const member = (name: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !reserved.has(name) ? '.' + name : `[${luaString(name)}]`;
export function generateMacros(project: ObjectProject, ids: CategoryId[]) {
  const calculator = createCalculator(project.sheets);
  return ids.map(id => {
    const sheet = project.sheets[id], seen = new Set<string>(), lines = ['<?', `Xm_OBJ_${id}= {}`, "local SLK = require 'slk'", 'local OBJ'];
    let count = 0;
    sheet.rows.forEach((row, index) => {
      if (!Object.values(row.cells).some(value => value !== '')) return;
      const read = (col: number) => {
        calculator.resetBudget();
        const result = calculator.read(id, index + 3, columnNumber(sheet.columns[col].letter));
        if (result.error) throw new ObjectExportError(`${sheet.name}!${sheet.columns[col].letter}${index + 3}：${result.text} ${result.error}`, id, index, col);
        return result.text;
      };
      const objectId = read(0) || `XG_${id}${index + 1}`, template = read(1);
      if (!template.trim()) throw new ObjectExportError(`${sheet.name}!C${index + 3}：缺少模板`, id, index, 1);
      if (seen.has(objectId)) throw new ObjectExportError(`${sheet.name}!B${index + 3}：重复 ID ${objectId}`, id, index, 0);
      seen.add(objectId);
      const templateBytes = escapedRawcode(template);
      lines.push('', `OBJ = SLK.${id}${templateBytes ? `[${templateBytes}]` : member(template)}:new(${escapedRawcode(objectId) ?? luaString(objectId)})`);
      sheet.columns.slice(2).forEach((column, offset) => {
        const raw = row.cells[column.key] ?? '';
        if (!raw || !column.field || column.field.startsWith('__blank_')) return;
        let value = read(offset + 2), field = column.field;
        const meta = resolveField(id, template, field, true);
        if (meta && /[^\x00-\x7f]/.test(field)) field = meta.repeat ? `${meta.field}${meta.level}` : meta.field;
        // Excel grouping is display formatting, not part of a numeric SLK value.
        if (meta && meta.type !== 3 && /[,\s()０-９−]/.test(value)) {
          const number = numericText(value);
          if (number !== undefined && Number.isFinite(number)) value = String(number);
        }
        lines.push(`    OBJ${member(field)} = ${luaString(raw === '#' || raw === '无' ? '' : value)}`);
      });
      lines.push(`table.insert(Xm_OBJ_${id}, OBJ)`); count++;
    });
    lines.push('?>', '');
    return { name: `Xm_${id}.lua`, text: '\ufeff' + lines.join('\r\n'), count };
  });
}
export const allCategoryIds = categories.map(c => c.id);
