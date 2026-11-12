import { describe, expect, it } from 'vitest';
import { heightSelection, worldPlacement, worldSelection } from './worldCoordinates';
import type { TerrainMapInfo } from './types';

describe('north-up terrain coordinates', () => {
  it('converts rectangles and placement independently for unequal map heights', () => {
    const rect = { x0: 2, x1: 4, y0: 1, y1: 2, mask: null };
    expect(worldSelection(rect, { width: 8, height: 10 })).toEqual({ ...rect, y0: 7, y1: 8 });
    expect(worldPlacement([3, 4], rect, 20)).toEqual([3, 14]);
  });
  it('flips paint holes and reverses exactly', () => {
    const rect = { x0: 0, x1: 1, y0: 0, y1: 2, mask: [true, false, false, true, false, false] };
    const map = { width: 2, height: 3 };
    expect(worldSelection(rect, map).mask).toEqual([false, false, false, true, true, false]);
    expect(worldSelection(worldSelection(rect, map), map)).toEqual(rect);
  });
  it('maps the source paint mask onto the placed target before adjusting height', () => {
    const source = { width: 4, height: 3 } as TerrainMapInfo;
    const target = { width: 6, height: 5 } as TerrainMapInfo;
    const rect = { x0: 1, x1: 2, y0: 0, y1: 1, mask: [false, true, false, false, false, false, true, false, false, false, false, false] };
    const result = heightSelection(rect, [3, 1], source, target);
    expect(result).toMatchObject({ x0: 3, x1: 4, y0: 2, y1: 3 });
    expect(result.mask?.flatMap((v, i) => v ? [i] : [])).toEqual([16, 21]);
  });
  it('uses the rotated target footprint when converting placement coordinates', () => {
    const rect = { x0: 0, y0: 0, x1: 2, y1: 4, mask: null };
    expect(worldPlacement([3, 6], rect, 20, 90)).toEqual([3, 11]);
  });
});
