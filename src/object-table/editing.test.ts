import { initialSheets } from './model';
import { beforeEach, describe, expect, it } from 'vitest';
import { useObjectTable } from './store';
import { decodeTsv, encodeTsv } from './clipboard';
import { parseObjectProject, currentProject, serializeObjectProject } from './project';
import { closestFreeze, columnOffsets, effectiveFrozen } from './grid/geometry';
import { categoryById } from './schema';
beforeEach(() => useObjectTable.setState({ ...useObjectTable.getInitialState(), sheets: initialSheets() }, true));
describe('填写、项目恢复和冻结范围', () => {
  it('直接填写保留中间空行、批量填写/清空为一个撤销操作', () => {
    const s = useObjectTable.getState(); s.write('item', 3, 1, [['ratf', 'A'], ['ratf', 'B']]);
    expect(useObjectTable.getState().sheets.item.rows).toHaveLength(5);
    s.undo(); expect(useObjectTable.getState().sheets.item.rows).toHaveLength(0);
    s.redo(); s.clear('item', 3, 4, 1, 2); s.undo();
    expect(useObjectTable.getState().sheets.item.rows[4].cells['item:D']).toBe('B');
  });
  it('带制表符、换行、双引号文案可完整复制粘贴', () => {
    const data = [['a\tb', 'x\ny', '"hi"'], ['1', '', '0']]; expect(decodeTsv(encodeTsv(data))).toEqual(data);
    expect(decodeTsv('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('项目保存原始公式/独立冻结，不保存计算缓存/撤销栈', () => {
    const s = useObjectTable.getState(); s.write('item', 0, 2, [['=1+2']]); s.setView('item', { frozen: 5 });
    const text = serializeObjectProject(); const p = parseObjectProject(text);
    expect(p.sheets.item.rows[0].cells['item:D']).toBe('=1+2'); expect(p.views.item.frozen).toBe(5);
    expect(text).not.toContain('past'); s.restore(p); expect(currentProject()).toEqual(p);
    expect(() => parseObjectProject(text.replace('war3-objects', 'unknown'))).toThrow();
  });
  it('冻结吸附、取消冻结及小窗口至少保留160px', () => {
    const offsets = columnOffsets(categoryById.item.columns);
    expect(closestFreeze(42, offsets, 1000)).toBe(0); expect(closestFreeze(274, offsets, 1000)).toBe(2);
    const actual = effectiveFrozen(5, offsets, 500); expect(offsets[actual]).toBeLessThanOrEqual(340);
    expect(effectiveFrozen(5, offsets, 1400)).toBe(5);
  });
});
