import { expect, test } from 'vitest';
import { wheelZoom, zoomAt } from './navigation';

test('zoom keeps the world point beneath an off-center cursor fixed after panning', () => {
  const before = { zoom: .4, panX: 137, panY: -82 };
  const cursor = { x: -215, y: 168 };
  const after = zoomAt(before.zoom, .9, before.panX, before.panY, cursor.x, cursor.y);
  expect((cursor.x - after.panX) / after.zoom).toBeCloseTo((cursor.x - before.panX) / before.zoom);
  expect((cursor.y - after.panY) / after.zoom).toBeCloseTo((cursor.y - before.panY) / before.zoom);
});

test('wheel zoom stays within the toolbar range and limits large wheel deltas', () => {
  expect(wheelZoom(2, -100)).toBe(2);
  expect(wheelZoom(.1, 100)).toBe(.1);
  expect(wheelZoom(.5, -1000)).toBe(wheelZoom(.5, -100));
  expect(wheelZoom(.5, 1000)).toBe(wheelZoom(.5, 100));
  expect(wheelZoom(.5, 0)).toBe(.5);
});
