import { describe, expect, it } from 'vitest';
import { visibleColumns } from './visibleColumns';
import { columnOffsets, effectiveFrozen } from './geometry';
import { initialSheets } from '../model';

describe('横向虚拟列', () => {
  it('滚到远端时保留冻结列、可见列及准确的占位宽度', () => {
    const offsets = columnOffsets(initialSheets().ability.columns);
    const slots = visibleColumns(offsets, 2, 5000, 1000);
    const cols = slots.flatMap(slot => slot.col === null ? [] : [slot.col]);
    expect(cols.slice(0, 2)).toEqual([0, 1]);
    expect(cols.length).toBeLessThan(20);
    expect(slots.reduce((total, slot) => total + slot.width, offsets[0])).toBe(offsets.at(-1));
    let x = offsets[0];
    for (const slot of slots) {
      if (slot.col !== null) expect(x).toBe(offsets[slot.col]);
      x += slot.width;
    }
    for (let col = 2; col < offsets.length - 1; col++) {
      if (offsets[col + 1] > 5000 + offsets[2] && offsets[col] < 6000) expect(cols).toContain(col);
    }
  });
  it('取消冻结、窗口缩小、极宽列和最右端不遗漏可见列', () => {
    const offsets = [42, 90, 4090, 4138, 4338];
    for (const [desired, left, width] of [[0, 0, 200], [2, 3000, 1000], [2, 4000, 200], [2, 0, 200]]) {
      const frozen = effectiveFrozen(desired, offsets, width);
      const slots = visibleColumns(offsets, frozen, left, width);
      for (let col = 0; col < offsets.length - 1; col++) {
        if (col < frozen || (offsets[col + 1] > left + offsets[frozen] && offsets[col] < left + width)) expect(slots.some(slot => slot.col === col)).toBe(true);
      }
      expect(slots.reduce((n, slot) => n + slot.width, 42)).toBe(4338);
    }
  });
  it('编辑中的离屏列保留，且不带回中间所有列', () => {
    const offsets = columnOffsets(initialSheets().unit.columns);
    const slots = visibleColumns(offsets, 0, 8000, 800, 3);
    expect(slots.some(slot => slot.col === 3)).toBe(true);
    expect(slots.filter(slot => slot.col !== null).length).toBeLessThan(15);
    expect(slots.reduce((n, slot) => n + slot.width, 42)).toBe(offsets.at(-1));
  });
});
