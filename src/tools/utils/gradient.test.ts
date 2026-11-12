import { expect, it } from "vitest";
import { gradientLine } from "./gradient";

it("covers the whole glyph box along horizontal, vertical and diagonal directions", () => {
  expect(gradientLine(120, 60, 0)).toEqual({ x0: 0, y0: 30, x1: 120, y1: 30 });
  const vertical = gradientLine(120, 60, 90);
  expect(vertical.x0).toBeCloseTo(60);
  expect(vertical.y0).toBeCloseTo(0);
  expect(vertical.x1).toBeCloseTo(60);
  expect(vertical.y1).toBeCloseTo(60);
  for (const angle of [30, 45, 135, 225, 270, 315]) {
    const line = gradientLine(120, 60, angle);
    const dx = line.x1 - line.x0,
      dy = line.y1 - line.y0;
    const lengthSquared = dx * dx + dy * dy;
    const projections = [
      [0, 0],
      [120, 0],
      [0, 60],
      [120, 60],
    ].map(
      ([x, y]) => ((x - line.x0) * dx + (y - line.y0) * dy) / lengthSquared,
    );
    expect(Math.min(...projections)).toBeCloseTo(0);
    expect(Math.max(...projections)).toBeCloseTo(1);
  }
});
