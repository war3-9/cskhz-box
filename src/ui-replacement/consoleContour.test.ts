import { expect, it } from 'vitest';
import { traceConsoleContour } from './consoleContour';

it('follows changing pixel heights and fills every lower interior hole with opaque black', () => {
  const pixels = new Uint8ClampedArray(4 * 6 * 4);
  const heights = [3, 1, 4, 2];
  for (let x = 0; x < 4; x++) pixels[(heights[x] * 4 + x) * 4 + 3] = 255;
  const result = traceConsoleContour(pixels, 4, 6);
  expect([...result.tops]).toEqual(heights);
  for (let x = 0; x < 4; x++) for (let y = 0; y < 6; y++) {
    const index = (y * 4 + x) * 4;
    expect([...result.backing.slice(index, index + 4)]).toEqual([0, 0, 0, y >= heights[x] ? 255 : 0]);
  }
  expect(result.points.slice(0, 8)).toEqual([0, 3, 1, 3, 1, 1, 2, 1]);
});
it('ignores faint outer glow and leaves empty columns completely transparent', () => {
  const pixels = new Uint8ClampedArray(2 * 5 * 4);
  pixels[(1 * 2) * 4 + 3] = 159;
  pixels[(3 * 2) * 4 + 3] = 160;
  const result = traceConsoleContour(pixels, 2, 5);
  expect([...result.tops]).toEqual([3, 5]);
  expect(result.backing[(2 * 2) * 4 + 3]).toBe(0);
  expect(result.backing[(3 * 2) * 4 + 3]).toBe(255);
  for (let y = 0; y < 5; y++) expect(result.backing[(y * 2 + 1) * 4 + 3]).toBe(0);
});
