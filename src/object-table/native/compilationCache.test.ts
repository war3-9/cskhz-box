import { describe, expect, it } from 'vitest';
import { createNativeCompiler } from './compilationCache';
import { compileNative, mapProject } from './mapping';
import { columnLetter, type ObjectProject } from '../model';
import type { NativeObject } from '../sync/types';
const object = (id: string): NativeObject => ({ id, parent: 'hfoo', custom: true, fields: {
  'unam:0:0': { id: 'unam', type: 3, level: 0, data: 0, value: id },
  'uhpm:0:0': { id: 'uhpm', type: 0, level: 0, data: 0, value: 500 },
} });
const fixture = () => mapProject({ path: 'F:/cache.w3x', fingerprint: 'source', objects: { 'unit:U001': object('U001'), 'unit:U002': object('U002') }, strings: {}, imports: [], warnings: [], raw: {} });
function edit(project: ObjectProject, kind: 'unit' | 'item', row: number, field: string, value: string): ObjectProject {
  const sheet = project.sheets[kind], key = (field === 'ID' ? sheet.columns[0] : field === 'Template' ? sheet.columns[1] : sheet.columns.find(c => c.field.toLowerCase() === field.toLowerCase()))!.key;
  return { ...project, sheets: { ...project.sheets, [kind]: { ...sheet, rows: sheet.rows.map((r,i) => i === row ? { ...r, cells: { ...r.cells, [key]: value } } : r) } } };
}
describe('不可变工作簿增量编译', () => {
  it('滚动、选择与重复读取复用结果，单格编辑只重建受影响对象，撤销恢复正确', () => {
    const compile = createNativeCompiler(), project = fixture(), first = compile(project);
    expect(compile({ ...project, views: { ...project.views, unit: { ...project.views.unit, top: 200 } } })).toBe(first);
    const changed = edit(project, 'unit', 0, 'HP', '777'), second = compile(changed);
    expect(second).toEqual(compileNative(changed));
    expect(second.objects['unit:U002']).toBe(first.objects['unit:U002']);
    expect(second.objects['unit:U001']).not.toBe(first.objects['unit:U001']);
    expect(compile(project)).toEqual(first);
  });
  it('其他工作表与辅助格改变后跨表公式重新计算，公式错误仍阻止写入', () => {
    let p = fixture(); const item = p.sheets.item;
    item.rows = [{ id: 'item', cells: { [item.columns[0].key]: 'I001', [item.columns[1].key]: 'ratf', [item.columns[2].key]: '5' } }];
    p = edit(p, 'unit', 0, 'HP', '=物品!D3*10');
    const compile = createNativeCompiler(); expect(compile(p).objects['unit:U001'].fields['uhpm:0:0'].value).toBe(50);
    p = edit(p, 'item', 0, item.columns[2].field, '9');
    expect(compile(p)).toEqual(compileNative(p)); expect(compile(p).objects['unit:U001'].fields['uhpm:0:0'].value).toBe(90);
    p = edit(p, 'unit', 0, 'HP', '=1/0'); expect(compile(p).blocked.has('unit:U001')).toBe(true);
  });
  it('删除被引用对象使未改行重新校验引用，不复用旧通过状态', () => {
    let p = fixture(); p = edit(p, 'unit', 0, 'Requires', 'U002');
    // The target exists only in the workbook, so removing it leaves the source
    // reference unchanged and specifically exercises cached reference validation.
    p = { ...p, metadata: { ...p.metadata!, binding: { ...p.metadata!.binding!, source: { ...p.metadata!.binding!.source, objects: {} } } } };
    const compile = createNativeCompiler(); expect(compile(p).issues).toEqual([]);
    p = { ...p, sheets: { ...p.sheets, unit: { ...p.sheets.unit, rows: p.sheets.unit.rows.slice(0, 1) } } };
    expect(compile(p)).toEqual(compileNative(p)); expect(compile(p).issues.some(i => i.message.includes('U002'))).toBe(true);
  });
  it('辅助格改变时跨表公式更新，普通行仍复用', () => {
    let p = fixture(); p = edit(p, 'unit', 0, 'HP', '=物品!A1*10');
    p = { ...p, sheets: { ...p.sheets, item: { ...p.sheets.item, auxiliary: { A1: '4' } } } };
    const compile = createNativeCompiler(), before = compile(p);
    expect(before.objects['unit:U001'].fields['uhpm:0:0'].value).toBe(40);
    p = { ...p, sheets: { ...p.sheets, item: { ...p.sheets.item, auxiliary: { A1: '6' } } } };
    const after = compile(p); expect(after).toEqual(compileNative(p));
    expect(after.objects['unit:U001'].fields['uhpm:0:0'].value).toBe(60);
    expect(after.objects['unit:U002']).toBe(before.objects['unit:U002']);
  });
  it('基线字段和管理范围改变后仍能清除继承字段，地图来源替换后未知字段仍阻止写入', () => {
    let p = fixture(); p = edit(p, 'unit', 1, 'Template', 'U001');
    const hp = p.sheets.unit.columns.find(c => c.field === 'HP')!.key;
    const row = p.sheets.unit.rows[1]; p.sheets.unit.rows[1] = { ...row, cells: { ...row.cells, [hp]: '' } };
    const compile = createNativeCompiler(); compile(p);
    p = { ...p, metadata: { ...p.metadata!, binding: { ...p.metadata!.binding!, baseline: { 'unit:U002': object('U002') } } } };
    expect(compile(p)).toEqual(compileNative(p)); expect(compile(p).objects['unit:U002'].fields['uhpm:0:0']).toBeUndefined();
    const source = p.metadata!.binding!.source;
    p = { ...p, metadata: { ...p.metadata!, binding: { ...p.metadata!.binding!, source: { ...source, objects: { ...source.objects, 'unit:U001': { ...object('U001'), fields: { ...object('U001').fields, 'zzzz:0:0': { id: 'zzzz', type: 3, level: 0, data: 0, value: '保留' } } } } } } } };
    expect(compile(p).blocked.has('unit:U001')).toBe(true);
  });
  it('列顺序/重复列的最后生效语义及重复ID检查不被缓存跳过', () => {
    let p = fixture(); const compile = createNativeCompiler(); compile(p);
    const sheet = p.sheets.unit, hp = sheet.columns.find(c => c.field === 'HP')!, letter = columnLetter(sheet.columns.length + 2), key = `unit:${letter}`;
    p = { ...p, sheets: { ...p.sheets, unit: { ...sheet, columns: [...sheet.columns, { ...hp, letter, key }], rows: sheet.rows.map(r => ({ ...r, cells: { ...r.cells, [key]: '999' } })) } } };
    expect(compile(p)).toEqual(compileNative(p)); expect(compile(p).objects['unit:U001'].fields['uhpm:0:0'].value).toBe(999);
    p = edit(p, 'unit', 1, 'ID', 'U001'); expect(compile(p).issues.some(i => i.message.includes('重复'))).toBe(true);
  });
});
