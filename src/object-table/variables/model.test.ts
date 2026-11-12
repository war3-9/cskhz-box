import { describe, expect, it } from 'vitest';
import { asDraft, planVariables, validateVariable, type GuiVariable } from './model';
const row: GuiVariable = { name: 'BoxNumber', type: 'integer', array: false, size: 1, initial: '1', initialized: true };
describe('GUI variable three-way edits', () => {
  it('preserves remote additions and independent edits while applying a local rename', () => {
    const draft = asDraft([row]); draft[0].name = 'BoxRenamed';
    const remote = { ...row, initial: '2' };
    expect(planVariables([row], draft, [remote, { ...row, name: 'External' }])).toEqual([{ before: remote, after: { ...remote, name: 'BoxRenamed' } }]);
  });
  it('rejects conflicting edits and deletion of externally changed variables', () => {
    expect(() => planVariables([row], [{ ...row, original: row.name, initial: '2' }], [{ ...row, initial: '3' }])).toThrow('同时修改');
    expect(() => planVariables([row], [], [{ ...row, initial: '3' }])).toThrow('待删除');
    expect(() => planVariables([row], asDraft([row]), [])).toThrow('删除或改名');
  });
  it('rejects duplicate case-insensitive names and renames over live names', () => {
    expect(() => planVariables([], [{ ...row, original: null }, { ...row, name: 'boxnumber', original: null }], [])).toThrow('重复');
    expect(() => planVariables([row], [{ ...row, name: 'External', original: row.name }], [row, { ...row, name: 'External' }])).toThrow('目标变量');
  });
  it('supports explicit empty-string initializers and strict UTF-8 byte limits', () => {
    expect(() => validateVariable({ ...row, name: 'Box/*中文*/', initial: '', initialized: true })).not.toThrow();
    expect(() => validateVariable({ ...row, initial: '中'.repeat(100) })).toThrow('300字节');
    for (const name of ['1name', 'gg_unit', 'name/*oops*/x', 'name\0']) expect(() => validateVariable({ ...row, name })).toThrow();
    expect(planVariables([row], [], [row])).toEqual([{ before: row, after: null }]);
  });
});
