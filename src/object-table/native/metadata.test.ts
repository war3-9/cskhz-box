import { describe, expect, it } from 'vitest';
import catalog from './metadata.json';
import { fieldsFor, nameForField, resolveField, supports } from './metadata';
import { categories } from '../schema';

describe('字段索引兼容性', () => {
  it('六类模板的别名、大小写、等级和字段类型与原有线性规则一致', () => {
    const defaults = catalog.defaults;
    for (const { id: kind } of categories) {
      const parents = [...new Set([Object.keys(defaults[kind])[0], ...Object.entries(defaults[kind]).filter(([, v]) => '_code' in v || 'isbldg' in v).slice(0, 8).map(([id]) => id), 'unknown'])];
      for (const parent of parents) {
        const fields = fieldsFor(kind, parent), supported = fields.filter(m => supports(kind, parent, m));
        for (const m of fields) {
          for (const name of [m.field, m.field.toUpperCase().replaceAll('_', ''), ...(m.repeat ? [m.field + '3', m.field.replaceAll('_', '') + '01'] : [])]) {
            const matches = (field: string, value: string) => field.toLowerCase() === value.toLowerCase() || field.replaceAll('_', '').toLowerCase() === value.toLowerCase();
            const exact = supported.find(f => matches(f.field, name)), parts = name.match(/^(.*?)(\d+)$/);
            const repeated = parts && supported.find(f => f.repeat && matches(f.field, parts[1]));
            const expected = exact ? { ...exact, level: exact.repeat ? 1 : 0 } : repeated ? { ...repeated, level: Number(parts![2]) } : undefined;
            expect(resolveField(kind, parent, name)).toEqual(expected);
          }
          for (const level of [0, 2]) {
            const field = { id: m.id, type: m.type, data: m.data ?? 0, level, value: '' };
            const first = fields.find(f => f.id === field.id && f.type === field.type && (f.data ?? 0) === field.data && (f.repeat || level === 0));
            const expected = first && supports(kind, parent, first) ? { field: first.repeat ? `${first.field}${level}` : first.field, title: `${first.label}${first.repeat ? ` · ${level}` : ''}` } : undefined;
            expect(nameForField(kind, parent, field)).toEqual(expected);
          }
        }
      }
    }
  });
});
