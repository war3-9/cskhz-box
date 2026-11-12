import { describe, expect, it } from "vitest";
import { hitsPixel, resolveHit, type AlphaMask } from "./alphaHit";
import type { ImageLayer } from "../shared/types";

const layer = (id: string, patch: Partial<ImageLayer> = {}): ImageLayer => ({
  id,
  name: id,
  kind: "asset",
  imagePath: id,
  x: 0,
  y: 0,
  width: 20,
  height: 20,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  ...patch,
});
const opaque: AlphaMask = {
  width: 2,
  height: 2,
  alpha: new Uint8Array([255, 255, 255, 255]),
};
const hollow: AlphaMask = {
  ...opaque,
  alpha: new Uint8Array([0, 255, 0, 255]),
};
describe("pixel hit resolution", () => {
  it("passes through four transparent upper layers and selects the lowest opaque pixel", () => {
    const layers = [
      layer("base"),
      ...[1, 2, 3, 4].map((id) => layer(String(id))),
    ];
    const lookup = (id: string) => (id === "base" ? opaque : hollow);
    expect(resolveHit(layers, { x: -5, y: -5 }, lookup)?.id).toBe("base");
    expect(resolveHit(layers, { x: 5, y: -5 }, lookup)?.id).toBe("4");
  });
  it("maps rotation, scale and off-canvas coordinates to original pixels", () => {
    const target = layer("off", {
      x: -100,
      y: 100,
      width: 40,
      height: 60,
      rotation: 90,
    });
    expect(hitsPixel(target, { x: -90, y: 90 }, hollow)).toBe(false);
    expect(hitsPixel(target, { x: -90, y: 110 }, hollow)).toBe(true);
  });
  it("ignores hidden, zero opacity and unloaded images but permits selecting a locked image", () => {
    expect(
      hitsPixel(layer("a", { visible: false }), { x: 0, y: 0 }, opaque),
    ).toBe(false);
    expect(hitsPixel(layer("a", { opacity: 0 }), { x: 0, y: 0 }, opaque)).toBe(
      false,
    );
    expect(hitsPixel(layer("a"), { x: 0, y: 0 })).toBe(false);
    expect(
      hitsPixel(layer("a", { locked: true }), { x: 0, y: 0 }, opaque),
    ).toBe(true);
    expect(hitsPixel(layer("a"), { x: 10, y: 0 }, opaque)).toBe(false);
  });
  it("uses new image sources and accepts any nonzero source alpha", () => {
    const masks = new Map([
      ["old", opaque],
      ["new", hollow],
    ]);
    expect(
      resolveHit([layer("a", { imagePath: "old" })], { x: -5, y: 0 }, (id) =>
        masks.get(id),
      ),
    ).toBeDefined();
    expect(
      resolveHit([layer("a", { imagePath: "new" })], { x: -5, y: 0 }, (id) =>
        masks.get(id),
      ),
    ).toBeUndefined();
    expect(
      hitsPixel(
        layer("a"),
        { x: -5, y: -5 },
        { ...opaque, alpha: new Uint8Array([1, 0, 0, 0]) },
      ),
    ).toBe(true);
  });
});
