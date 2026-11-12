import { describe, expect, it } from 'vitest';
import { clampCrop, resizeCrop } from './geometry';
describe('crop coordinates', () => {
  it('clamps invalid and outside coordinates without a zero area', () => {
    expect(clampCrop({ x: -10, y: 999, width: Infinity, height: -2 }, 100, 80)).toEqual({ x: 0, y: 79, width: 1, height: 1 });
  });
  it('keeps movement inside the image without resizing', () => {
    expect(resizeCrop({ x: 10, y: 20, width: 30, height: 40 }, 'move', 999, -999, 100, 80)).toEqual({ x: 70, y: 0, width: 30, height: 40 });
  });
  it('anchors the opposite corner while scaling a constrained crop', () => {
    expect(resizeCrop({ x: 20, y: 20, width: 40, height: 40 }, 'nw', -100, -100, 100, 100, 1)).toEqual({ x: 0, y: 0, width: 60, height: 60 });
  });
  it('all eight handles retain a bounded positive crop under large drags', () => {
    for (const handle of ['n','ne','e','se','s','sw','w','nw']) for (const ratio of [0,1,4/3,16/9]) for (const delta of [-999,999]) {
      const r = resizeCrop({ x: 20, y: 20, width: 40, height: 30 }, handle, delta, delta, 120, 100, ratio);
      expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.width).toBeGreaterThanOrEqual(1); expect(r.height).toBeGreaterThanOrEqual(1);
      expect(r.x+r.width).toBeLessThanOrEqual(120); expect(r.y+r.height).toBeLessThanOrEqual(100);
    }
  });
});
