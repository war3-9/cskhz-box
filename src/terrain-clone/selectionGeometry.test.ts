import { expect, it } from 'vitest';
import { handles, moveSelection, resizeSelection, placementRect, rotatedDimensions } from './selectionGeometry';

const rect = { x0: 10, y0: 20, x1: 30, y1: 40, mask: null };
it('moves the entire rectangle and keeps its dimensions at map boundaries', () => {
  expect(moveSelection(rect, [-99, 99], 50, 50)).toEqual({ x0: 0, y0: 29, x1: 20, y1: 49, mask: null });
});
it('resizes all eight handles independently and prevents inverted bounds', () => {
  for (const [handle] of handles(rect)) {
    const result = resizeSelection(rect, handle, [3, 4], 50, 50);
    expect(result.x0).toBe(handle.includes('w') ? 13 : 10);
    expect(result.x1).toBe(handle.includes('e') ? 33 : 30);
    expect(result.y0).toBe(handle.includes('n') ? 24 : 20);
    expect(result.y1).toBe(handle.includes('s') ? 44 : 40);
  }
  expect(resizeSelection(rect, 'nw', [999, 999], 50, 50)).toEqual({ x0: 30, y0: 40, x1: 30, y1: 40, mask: null });
});
it('swaps target placement dimensions for quarter turns', () => {
  expect(rotatedDimensions({ x0: 1, y0: 2, x1: 5, y1: 8, mask: null }, 90)).toEqual([7, 5]);
  expect(placementRect({ x0: 1, y0: 2, x1: 5, y1: 8, mask: null }, [10, 11], 90)).toEqual({ x0: 10, y0: 11, x1: 16, y1: 15, mask: null });
});
