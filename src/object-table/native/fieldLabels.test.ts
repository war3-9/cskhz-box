import { expect, it } from 'vitest';
import { categoryById } from '../schema';
import { fieldPresentation } from './fieldLabels';
import { fieldsFor, resolveField, supports } from './metadata';
import { compileNative, mapProject } from './mapping';
import catalog from './metadata.json';
it('armor and spell book share DataA but show the selected template meaning', () => {
  const col = categoryById.ability.columns.find(c => c.field === 'DataA1')!;
  expect(fieldPresentation('ability', 'AId1', col).title).toContain('防御奖励');
  expect(fieldPresentation('ability', 'Aspb', col).title).toContain('法术列表');
  expect(col.title).toBe('法术列表');
  expect(resolveField('unit', 'hfoo', '防御')?.id).toBe('udef');
  expect(resolveField('ability', 'AId1', '数据 - 防御奖励 · 2')?.id).toBe('Idef');
  expect(resolveField('ability', 'AId1', '数据 - 防御奖励 · 2')?.level).toBe(2);
});
it('all template-specific native fields retain their editor names and writable types', () => {
  let count = 0;
  for (const kind of Object.keys(catalog.defaults) as (keyof typeof catalog.defaults)[]) {
    for (const parent of Object.keys(catalog.defaults[kind])) {
      for (const m of fieldsFor(kind, parent).filter(m => supports(kind, parent, m))) {
        expect(resolveField(kind, parent, m.field)?.id).toBe(m.id); count++;
      }
    }
  }
  expect(count).toBeGreaterThan(100000);
});
it('integer diagnostics identify actual input without truncating fractions or overflowing values', () => {
  const p = mapProject({ path: '', fingerprint: '', strings: {}, raw: {}, imports: [], warnings: [], objects: { 'item:I001': { id: 'I001', parent: 'ratf', custom: true, fields: { 'ipri:0:0': { id: 'ipri', type: 0, level: 0, data: 0, value: 1 } } } } });
  const column = p.sheets.item.columns.find(c => c.field === 'prio')!;
  for (const [input, expected] of [['1.5', '需要整数'], ['abc', '需要有效数值'], ['2147483648', '整数范围']]) {
    p.sheets.item.rows[0].cells[column.key] = input;
    const result = compileNative(p); expect(result.issues[0].message).toContain(expected); expect(result.issues[0].message).toContain(input); expect(result.blocked.has('item:I001')).toBe(true);
  }
});
