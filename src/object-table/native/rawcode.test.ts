import { describe, expect, it } from 'vitest';
import { rawcodeBytes, validRawcode, escapedRawcode } from './rawcode';
import { mapProject, compileNative } from './mapping';
import { mapReadSchema, metadataSchema } from '../sync/schema';
import { generateMacros } from '../export';
import type { MapRead } from '../sync/types';
import { seriesValues } from '../fill/series';

describe('旧地图四字节 ID', () => {
  it('普通 ID 沿用原样，特殊 ID 可逆且不接受冲突拼写或全零', () => {
    expect(rawcodeBytes("A'\\1")).toEqual([65, 39, 92, 49]);
    expect(rawcodeBytes('0xC4E3BAC3')).toEqual([196, 227, 186, 195]);
    expect(rawcodeBytes('0x8000FF01')).toEqual([128, 0, 255, 1]);
    for (const id of ['0x41483031', '0xc4E3BAC3', '0xC4E3BAC', '中文', '0x00000000']) expect(validRawcode(id)).toBe(false);
    expect(escapedRawcode('0xC4E3BAC3')).toBe("'\\196\\227\\186\\195'");
  });
  it('读取、表格修改、工作区恢复和宏导出保持同一个 ID', () => {
    const id = '0x8000FF01';
    const map: MapRead = { path: 'F:/旧图.w3x', fingerprint: 'hash', raw: { unit: [128, 0, 255, 1] }, strings: {}, imports: [], warnings: [], objects: {
      [`unit:${id}`]: { id, parent: 'hfoo', custom: true, fields: { 'unam:0:0': { id: 'unam', type: 3, level: 0, data: 0, value: '旧名称' } } },
    } };
    const project = mapProject(mapReadSchema.parse(map));
    project.sheets.unit.rows[0].cells['unit:D'] = '修改名称';
    const compiled = compileNative(project);
    expect(compiled.issues).toEqual([]);
    expect(compiled.objects[`unit:${id}`].fields['unam:0:0'].value).toBe('修改名称');
    expect(metadataSchema.parse(JSON.parse(JSON.stringify(project.metadata))).binding?.source.objects[`unit:${id}`].id).toBe(id);
    const lua = generateMacros(project, ['unit'])[0].text;
    expect(lua).toContain("SLK.unit.hfoo:new('\\128\\000\\255\\001')");
    expect(lua).not.toContain(`new('${id}')`);
  });
  it('特殊模板 ID 的导出与未知字段保留不丢失', () => {
    const map: MapRead = { path: 'F:/旧图.w3x', fingerprint: '', raw: {}, strings: {}, imports: [], warnings: [], objects: {
      'ability:0xC4E3BAC3': { id: '0xC4E3BAC3', parent: 'AHbz', custom: true, fields: {} },
      'ability:A002': { id: 'A002', parent: '0xC4E3BAC3', custom: true, fields: {} },
    } };
    const project = mapProject(map);
    expect(compileNative(project).issues).toEqual([]);
    expect(generateMacros(project, ['ability'])[0].text).toContain("SLK.ability['\\196\\227\\186\\195']:new('A002')");
    map.objects['ability:A002'].fields['0x81FE0020:0:0'] = { id: '0x81FE0020', type: 0, level: 0, data: 0, value: 17 };
    const unknown = mapProject(map);
    expect(mapReadSchema.parse(map).objects['ability:A002'].fields['0x81FE0020:0:0'].value).toBe(17);
    expect(unknown.metadata?.binding?.source.objects['ability:A002'].fields['0x81FE0020:0:0'].value).toBe(17);
    expect(compileNative(unknown).blocked.has('ability:A002')).toBe(true);
  });
  it('填充按四字节 ID 递增，不把十六进制显示串改为十进制编号', () => {
    expect(seriesValues(['0x8000FF01'], 2, { letter: 'B' })).toEqual(['0x8000FF02', '0x8000FF03']);
    expect(seriesValues(['0x8000FF01', '0x8000FF03'], 2, { letter: 'B' })).toEqual(['0x8000FF05', '0x8000FF07']);
    expect(seriesValues(['0x8000FF01'], 1, { letter: 'B', fill: { operation: 'add', operand: 3 } })).toEqual(['0x8000FF04']);
    expect(seriesValues(['0x4148301F'], 1, { letter: 'B' })).toEqual(['0x41483020']);
    expect(seriesValues(['0x41483020'], 1, { letter: 'B' })).toEqual(['AH0!']);
    expect(() => seriesValues(['0xFFFFFFFF'], 1, { letter: 'B' })).toThrow('四字节范围');
  });
});
