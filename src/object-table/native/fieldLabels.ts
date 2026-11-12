import { categories, type CategoryId, type ObjectColumn } from '../schema';
import { resolveField } from './metadata';

/** Data A-F and UnitID change meaning with the template, never rename stored fields. */
export function fieldPresentation(kind: CategoryId, parent: string, column: ObjectColumn) {
  const meta = resolveField(kind, parent, column.field, true);
  const label = meta ? `${meta.label}${meta.repeat ? ` · ${meta.level}` : ''}` : '';
  const contextual = kind === 'ability' && /^(Data[A-Z]|UnitID)\d*$/i.test(column.field);
  return { title: contextual && label ? label : column.title, search: `${column.title} ${column.field} ${column.letter} ${label} ${meta?.id ?? ''}${kind === 'unit' && meta?.id === 'udef' ? ' 防御 护甲 基础防御' : ''}` };
}

/** All labels actually used in this sheet, for search without changing its data. */
export function sheetFieldLabels(kind: string, parents: string[], columns: ObjectColumn[]) {
  if (!categories.some(c => c.id === kind)) return columns.map(c => `${c.title} ${c.field}`);
  const contexts = [...new Set(parents)];
  return columns.map(c => `${c.title} ${c.field} ${contexts.map(p => fieldPresentation(kind as CategoryId, p, c).search).join(' ')}`);
}
