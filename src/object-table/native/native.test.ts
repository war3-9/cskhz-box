import { describe, expect, it } from 'vitest';
import { applyNativeObject, compileNative, mapProject, resolveString } from './mapping';
import type { MapRead, NativeObject, ObjectSnapshot } from '../sync/types';
import { categories } from '../schema';
import { levelList } from './lists';
const unit: NativeObject = { id: 'U001', parent: 'hfoo', custom: true, fields: { 'unam:0:0': { id: 'unam', type: 3, level: 0, data: 0, value: 'TRIGSTR_001' }, 'uhpm:0:0': { id: 'uhpm', type: 0, level: 0, data: 0, value: 500 } } };
const map = (objects: ObjectSnapshot = { 'unit:U001': unit }): MapRead => ({ path: 'F:/same/地图.w3x', fingerprint: 'hash', objects, strings: { '1': '中文\n第二行' }, raw: { unit: [2, 0, 0] }, imports: ['war3mapImported\\foo.blp'], warnings: [] });
describe('地图字段映射与独立原生编译', () => {
  it('六类读取、字符串、原始数据及表头按类别独立保留', () => {
    const objects = Object.fromEntries(categories.map(c => [`${c.id}:X001`, { ...unit, parent: ({ item: 'ratf', unit: 'hfoo', ability: 'AHbz', upgrade: 'Rhme', doodad: 'APct', buff: 'BHbz' })[c.id] }]));
    const project = mapProject(map(objects));
    expect(categories.map(c => project.sheets[c.id].rows.length)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(project.sheets.unit.rows[0].cells['unit:D']).toBe('中文|n第二行'); expect(project.metadata?.binding?.source.raw.unit).toEqual([2, 0, 0]);
  });
  it('默认只铺自定义对象，原生修改仍保留在地图资料', () => {
    const source = map({ 'unit:U001': unit, 'unit:hfoo': { ...unit, id: 'hfoo', custom: false } });
    expect(mapProject(source).sheets.unit.rows).toHaveLength(1); expect(mapProject(source, true).sheets.unit.rows).toHaveLength(2);
  });
  it('字段重排与重复字段按最后一列生效，公式向前发送计算结果', () => {
    const project = mapProject(map()); const sheet = project.sheets.unit;
    const hp = sheet.columns.find(c => c.field.toLowerCase() === 'hp')!;
    sheet.rows[0].cells[hp.key] = '=250*3';
    const compiled = compileNative(project); expect(compiled.issues).toEqual([]); expect(compiled.objects['unit:U001'].fields['uhpm:0:0'].value).toBe(750);
    expect(compiled.formulas.has('unit:U001/uhpm:0:0')).toBe(true);
  });
  it('空ID预分配避免地图与表格占用，保留ID大小写，不改宏规则', () => {
    const project = mapProject(map()); const sheet = project.sheets.unit;
    delete sheet.rows[0].cells[sheet.columns[0].key];
    const result = compileNative(project); expect(result.allocations[0].id).toHaveLength(4); expect(result.allocations[0].id).not.toBe('U001');
    sheet.rows[0].cells[sheet.columns[0].key] = 'Yu01'; expect(compileNative(project).objects['unit:Yu01']).toBeDefined();
    sheet.rows[0].cells[sheet.columns[0].key] = "U'\\1"; expect(compileNative(project).objects["unit:U'\\1"]).toBeDefined();
    sheet.rows[0].cells[sheet.columns[0].key] = 'longID'; expect(compileNative(project).issues[0].col).toBe(0);
  });
  it('重复ID、公式错误、未知字段阻止对象写入并定位', () => {
    const project = mapProject(map()); project.sheets.unit.rows.push({ ...project.sheets.unit.rows[0], id: 'other' });
    expect(compileNative(project).issues.some(i => i.message.includes('重复'))).toBe(true);
    const unknown = map({ 'unit:U001': { ...unit, fields: { ...unit.fields, 'zzzz:0:0': { id: 'zzzz', level: 0, data: 0, type: 3, value: '保留' } } } });
    const imported = mapProject(unknown); expect(imported.sheets.unit.columns.some(c => c.field === '@zzzz:0:0')).toBe(true); expect(compileNative(imported).issues.some(i => i.message.includes('未知'))).toBe(true);
    expect(imported.metadata?.binding?.source.objects['unit:U001'].fields['zzzz:0:0'].value).toBe('保留');
  });
  it('等级列表与重复数据字段准确对应，反向只回填生效的最后列', () => {
    const ability: NativeObject = { id: 'A001', parent: 'AHbz', custom: true, fields: { 'Hbz1:2:1': { id: 'Hbz1', level: 2, data: 1, type: 0, value: 17 } } };
    const project = mapProject(map({ 'ability:A001': ability })); const result = compileNative(project);
    expect(result.issues).toEqual([]); expect(result.objects['ability:A001'].fields['Hbz1:2:1'].value).toBe(17);
    const reverse = applyNativeObject(project.sheets.ability, { ...ability, fields: { 'Hbz1:2:1': { ...ability.fields['Hbz1:2:1'], value: 99 } } }, 'ability', 'A001');
    const column = reverse.columns.find(c => c.field === 'DataA2')!; expect(reverse.rows[0].cells[column.key]).toBe('99');
    expect(levelList('{"a,b",2,"x""y"}')).toEqual(['a,b', '2', 'x"y']); expect(() => levelList('{"bad}')).toThrow();
  });
  it('缺失和循环字符串引用拒绝；空白不猜测，清空受管理字段为默认', () => {
    expect(() => resolveString('TRIGSTR_099', {})).toThrow(); expect(() => resolveString('TRIGSTR_001', { '1': 'TRIGSTR_002', '2': 'TRIGSTR_001' })).toThrow();
    const project = mapProject(map()); const binding = project.metadata!.binding!; binding.baseline = { 'unit:U001': unit };
    const sheet = project.sheets.unit; delete sheet.rows[0].cells[sheet.columns.find(c => c.field.toLowerCase() === 'hp')!.key];
    expect(compileNative(project).objects['unit:U001'].fields['uhpm:0:0']).toBeUndefined();
  });
  it('当前地图自定义模板展开为原生模板及继承属性', () => {
    const project = mapProject(map()); const sheet = project.sheets.unit;
    sheet.rows[0].cells[sheet.columns[0].key] = 'U002'; sheet.rows[0].cells[sheet.columns[1].key] = 'U001';
    const result = compileNative(project); expect(result.issues).toEqual([]); expect(result.objects['unit:U002'].parent).toBe('hfoo'); expect(result.objects['unit:U002'].fields['uhpm:0:0'].value).toBe(500);
  });
  it('# 与无明确覆盖为空字符串，留白恢复默认，读取和回填仍可区分空值', () => {
    const project = mapProject(map()), sheet = project.sheets.unit, name = sheet.columns.find(c => c.field === 'Name')!;
    project.metadata!.binding!.baseline = { 'unit:U001': unit };
    for (const marker of ['#', '无']) {
      sheet.rows[0].cells[name.key] = marker;
      const compiled = compileNative(project); expect(compiled.issues).toEqual([]);
      const empty = compiled.objects['unit:U001'];
      expect(empty.fields['unam:0:0']).toEqual({ id: 'unam', type: 3, level: 0, data: 0, value: '' });
      expect(mapProject(map({ 'unit:U001': empty })).sheets.unit.rows[0].cells[name.key]).toBe('#');
      expect(applyNativeObject(sheet, empty, 'unit', 'U001').rows[0].cells[name.key]).toBe('#');
    }
    delete sheet.rows[0].cells[name.key];
    expect(compileNative(project).objects['unit:U001'].fields['unam:0:0']).toBeUndefined();
  });
  it('自定义模板的已有文字可用 # 覆盖为空，留白仍继承模板文字', () => {
    const project = mapProject(map()), sheet = project.sheets.unit, row = sheet.rows[0];
    row.cells[sheet.columns[0].key] = 'U002'; row.cells[sheet.columns[1].key] = 'U001';
    row.cells['unit:D'] = '#';
    expect(compileNative(project).objects['unit:U002'].fields['unam:0:0'].value).toBe('');
    delete row.cells['unit:D'];
    expect(compileNative(project).objects['unit:U002'].fields['unam:0:0'].value).toBe('中文|n第二行');
  });
  it('数值字段拒绝空值标记并定位，显式 0 正常写入', () => {
    const project = mapProject(map()), sheet = project.sheets.unit, hp = sheet.columns.find(c => c.field.toLowerCase() === 'hp')!;
    sheet.rows[0].cells[hp.key] = '#';
    const compiled = compileNative(project);
    expect(compiled.issues.some(i => i.col === sheet.columns.indexOf(hp) && i.message.includes('清零请填 0'))).toBe(true);
    expect(compiled.blocked.has('unit:U001')).toBe(true);
    sheet.rows[0].cells[hp.key] = '0';
    expect(compileNative(project).issues).toEqual([]);
    expect(compileNative(project).objects['unit:U001'].fields['uhpm:0:0'].value).toBe(0);
  });
  it('地图文字中的等号、单引号、清空标记和显式空字符串保留为文本', () => {
    for (const value of ['=1+2', "'原文", '#', '无', '']) {
      const source = map({ 'unit:U001': { ...unit, fields: { 'unam:0:0': { ...unit.fields['unam:0:0'], value } } } });
      const compiled = compileNative(mapProject(source)); expect(compiled.issues).toEqual([]); expect(compiled.objects['unit:U001'].fields['unam:0:0'].value).toBe(value); expect(compiled.formulas.size).toBe(0);
    }
  });
  it('装饰物变体分别映射，类型或变体不匹配时保留未知列并阻止写入', () => {
    const source = map({ 'doodad:D001': { id: 'D001', parent: 'APct', custom: true, fields: {
      'dvr1:1:0': { id: 'dvr1', level: 1, data: 0, type: 0, value: 128 }, 'dvr1:2:0': { id: 'dvr1', level: 2, data: 0, type: 0, value: 64 },
    } } });
    const compiled = compileNative(mapProject(source)); expect(compiled.issues).toEqual([]); expect(compiled.objects['doodad:D001'].fields['dvr1:2:0'].value).toBe(64);
    source.objects['doodad:D001'].fields['dnam:2:0'] = { id: 'dnam', level: 2, data: 0, type: 3, value: '无法按普通名字转换' };
    expect(compileNative(mapProject(source)).issues.length).toBeGreaterThan(0);
  });
});
