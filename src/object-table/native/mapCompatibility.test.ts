import { describe, expect, it } from 'vitest';
import { applyNativeObject, compileNative, mapProject } from './mapping';
import { nameForField, resolveField } from './metadata';
import { createNativeCompiler } from './compilationCache';
import { rawcodeBytes, validRawcode } from './rawcode';
import catalog from './metadata.json';
import type { MapRead, NativeField, NativeObject, ObjectSnapshot } from '../sync/types';

const field = (id: string, value: string | number, type = 0, level = 0, data = 0): NativeField => ({ id, value, type, level, data });
const object = (id: string, parent: string, ...fields: NativeField[]): NativeObject => ({ id, parent, custom: true, fields: Object.fromEntries(fields.map(f => [`${f.id}:${f.level}:${f.data}`, f])) });
const source = (objects: ObjectSnapshot): MapRead => ({ path: 'F:/fixture.w3x', fingerprint: 'fixture', objects, strings: {}, raw: {}, warnings: [], imports: [] });

describe('旧地图物编字段兼容', () => {
  it('旧工作簿的 Buttonpos 列按 X 分量编译，导图不增加重复列', () => {
    for (const [kind, parent, id, rawcode] of [
      ['item', 'ratf', 'I001', 'ubpx'],
      ['ability', 'AHbz', 'A001', 'abpx'],
    ] as const) {
      const original = object(id, parent, field(rawcode, 2));
      const project = mapProject(source({ [`${kind}:${id}`]: original }));
      const sheet = project.sheets[kind];
      expect(sheet.columns.filter(c => c.field === 'Buttonpos_1')).toHaveLength(0);
      const legacy = sheet.columns.find(c => c.field === 'Buttonpos')!;
      expect(sheet.rows[0].cells[legacy.key]).toBe('2');
      expect(compileNative(project).issues).toEqual([]);
      expect(compileNative(project).objects[`${kind}:${id}`]).toEqual(original);
    }
  });
  it('ANpa 的旧格式 Npa6 数据分量保持原始身份并允许其他字段同步', () => {
    const original = object('A00Y', 'ANpa', field('Npa6', 20, 2, 1, 0));
    const project = mapProject(source({ 'ability:A00Y': original }));
    const compiled = compileNative(project);
    expect(compiled.issues).toEqual([]);
    expect(compiled.objects['ability:A00Y']).toEqual(original);
    const column = project.sheets.ability.columns.find(c => c.field === '@Npa6:1:0')!;
    expect(project.sheets.ability.rows[0].cells[column.key]).toBe('20');
    project.sheets.ability.rows[0].cells[column.key] = '25';
    expect(compileNative(project).objects['ability:A00Y'].fields['Npa6:1:0'].value).toBe(25);
  });
  it('建筑等级、英雄魔法升级文本按原有类型往返，不改变新对象的适用限制', () => {
    const objects = {
      'unit:U001': object('U001', 'hatw', field('ulev', 25)),
      'unit:H001': object('H001', 'Hpal', field('ucun', '名字', 3), field('ucut', '说明', 3)),
    };
    const project = mapProject(source(objects)), result = compileNative(project);
    expect(result.issues).toEqual([]); expect(result.objects).toEqual(objects);
    expect(resolveField('unit', 'hatw', 'level')).toBeUndefined();
    expect(resolveField('unit', 'Hpal', 'Casterupgradename')).toBeUndefined();
    const sheet = project.sheets.unit;
    sheet.rows.push({ id: 'new', cells: { [sheet.columns[0].key]: 'U002', [sheet.columns[1].key]: 'hatw', [sheet.columns.find(c => c.field === 'level')!.key]: '50' } });
    expect(compileNative(project).blocked.has('unit:U002')).toBe(true);
    const updated = object('U001', 'hatw', field('ulev', 30));
    project.sheets.unit = applyNativeObject(sheet, updated, 'unit', 'U001');
    expect(compileNative(project).objects['unit:U001']).toEqual(updated);
  });

  it('狂热/嗜血术的移动速度和诅咒的四字节字段都映射到正确数据列', () => {
    const objects = {
      'ability:A001': object('A001', 'Afzy', field('Blo2', 1, 2, 1, 2)),
      'ability:A002': object('A002', 'ACbl', field('Blo2', 0.5, 2, 2, 2)),
      'ability:A003': object('A003', 'Acrs', field('0x43727300', Math.fround(0.85), 2, 1, 1)),
      'ability:A004': object('A004', 'ACcs', field('0x43727300', 0.5, 2, 3, 1)),
    };
    const result = compileNative(mapProject(source(objects)));
    expect(result.issues).toEqual([]); expect(result.objects).toEqual(objects);
    expect(rawcodeBytes('0x43727300')).toEqual([0x43, 0x72, 0x73, 0]);
    expect(nameForField('ability', 'Afzy', objects['ability:A001'].fields['Blo2:1:2'])?.field).toBe('DataB1');
    expect(nameForField('ability', 'Acrs', objects['ability:A003'].fields['0x43727300:1:1'])?.field).toBe('DataA1');
  });

  it('修复前保存的 @字段列可以直接恢复，真正未知或类型不符的字段仍阻止写入', () => {
    for (const [kind, parent, f] of [
      ['unit', 'hatw', field('ulev', 25)], ['ability', 'Afzy', field('Blo2', 1, 2, 1, 2)],
      ['ability', 'Acrs', field('0x43727300', 0.5, 2, 1, 1)],
    ] as const) {
      const original = object('X001', parent, f), key = `${kind}:X001`, project = mapProject(source({ [key]: original })), sheet = project.sheets[kind];
      const name = nameForField(kind, parent, f, true)!.field, col = sheet.columns.find(c => c.field === name)!;
      sheet.columns = sheet.columns.map(c => c === col ? { ...c, field: `@${f.id}:${f.level}:${f.data}` } : c);
      expect(compileNative(project).issues).toEqual([]); expect(compileNative(project).objects[key]).toEqual(original);
      const updated = object('X001', parent, { ...f, value: f.type === 0 ? 50 : 0.25 });
      const columns = sheet.columns.length;
      project.sheets[kind] = applyNativeObject(sheet, updated, kind, 'X001');
      expect(project.sheets[kind].columns).toHaveLength(columns);
      expect(compileNative(project).objects[key]).toEqual(updated);
    }
    for (const f of [field('zzzz', 1), field('ulev', '错误类型', 3)]) {
      const original = object('U001', 'hatw', f), project = mapProject(source({ 'unit:U001': original }));
      expect(compileNative(project).blocked.has('unit:U001')).toBe(true);
      expect(project.metadata!.binding!.source.objects['unit:U001']).toEqual(original);
    }
  });

  it('原图已有无效引用保持原值并提示，修改引用或复制成新对象时仍拒绝新错误', () => {
    const original = object('U001', 'hfoo', field('uabi', 'Actb', 3), field('uhpm', 500));
    const project = mapProject(source({ 'unit:U001': original })), sheet = project.sheets.unit;
    const compiler = createNativeCompiler(), result = compiler(project);
    expect(result.issues).toEqual([]); expect(result.warnings).toHaveLength(1);
    expect(result.objects['unit:U001']).toEqual(original);
    sheet.rows[0].cells[sheet.columns.find(c => c.field === 'HP')!.key] = '600';
    const changed = { ...project, sheets: { ...project.sheets, unit: { ...sheet, rows: sheet.rows.map(r => ({ ...r, cells: { ...r.cells } })) } } };
    expect(compiler(changed)).toEqual(compileNative(changed)); expect(compiler(changed).warnings).toHaveLength(1);
    const abilities = sheet.columns.find(c => c.field.toLowerCase() === 'abillist')!;
    sheet.rows[0].cells[abilities.key] = 'Nope';
    expect(compileNative(project).blocked.has('unit:U001')).toBe(true);
    sheet.rows[0].cells[abilities.key] = 'Actb'; sheet.rows[0].cells[sheet.columns[0].key] = 'U002';
    expect(compileNative(project).blocked.has('unit:U002')).toBe(true);
  });

  it('字段目录全部 ID 为无损四字节，模板适用列表没有错误分隔符', () => {
    for (const fields of Object.values(catalog.metadata)) for (const meta of Object.values(fields)) expect(validRawcode(meta.id), meta.id).toBe(true);
    for (const rules of Object.values(catalog.rules)) for (const rule of Object.values(rules)) {
      if ('useSpecific' in rule && typeof rule.useSpecific === 'string') for (const id of rule.useSpecific.split(',')) expect(['0', '_', '*'].includes(id) || validRawcode(id), id).toBe(true);
    }
  });
});

