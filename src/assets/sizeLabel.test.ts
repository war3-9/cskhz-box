import { expect, it } from "vitest";
import { sizeLabel } from "./sizeLabel";
it.each([
  [127, 127, "游戏"],
  [128, 127, null],
  [127, 128, null],
  [128, 128, null],
  [299, 299, null],
  [300, 299, null],
  [299, 300, null],
  [300, 300, "商城"],
  [400, 600, "商城"],
])("labels %s x %s as %s", (width, height, expected) => {
  expect(sizeLabel({ width: Number(width), height: Number(height) })).toBe(
    expected,
  );
});
it("does not classify font preview images", () => {
  expect(sizeLabel({ kind: "font", width: 480, height: 480 })).toBeNull();
});
