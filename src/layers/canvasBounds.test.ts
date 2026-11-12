import { beforeEach, expect, it } from "vitest";
import { emptyDocument, useEditor } from "./store";
import type { Asset, EditorDocument } from "../shared/types";

const asset: Asset = {
  id: "wide",
  name: "宽图",
  categoryId: "fire",
  groupId: "rank",
  source: "builtin",
  imagePath: "/assets/fire-1.png",
  thumbnailPath: "/assets/fire-1.png",
  width: 3000,
  height: 1500,
};
beforeEach(() => {
  useEditor.getState().loadDocument(emptyDocument());
  useEditor.getState().newCanvas(768, 768);
});

function expectContained(document: EditorDocument) {
  for (const layer of document.layers) {
    const radians = (layer.rotation * Math.PI) / 180;
    for (const x of [-layer.width / 2, layer.width / 2]) {
      for (const y of [-layer.height / 2, layer.height / 2]) {
        const px = layer.x + x * Math.cos(radians) - y * Math.sin(radians);
        const py = layer.y + x * Math.sin(radians) + y * Math.cos(radians);
        expect(px).toBeGreaterThanOrEqual(-1e-8);
        expect(py).toBeGreaterThanOrEqual(-1e-8);
        expect(px).toBeLessThanOrEqual(document.width + 1e-8);
        expect(py).toBeLessThanOrEqual(document.height + 1e-8);
      }
    }
  }
}

it("creates an integer pixel canvas and can undo/redo replacement", () => {
  const s = useEditor.getState();
  s.setBase(asset);
  const previous = useEditor.getState().document;
  s.newCanvas(320, 180);
  expect(useEditor.getState().document).toMatchObject({
    width: 320,
    height: 180,
    layers: [],
  });
  s.undo();
  expect(useEditor.getState().document).toEqual(previous);
  s.redo();
  expect(useEditor.getState().document.layers).toHaveLength(0);
  for (const size of [NaN, Infinity, 63, 4097, 120.5]) {
    const current = useEditor.getState().document;
    s.newCanvas(size, 180);
    s.resize(320, size);
    expect(useEditor.getState().document).toBe(current);
  }
});

it("keeps the chosen canvas when importing a large base and replacing it", () => {
  const s = useEditor.getState();
  s.newCanvas(320, 180);
  s.setBase(asset);
  s.setBase({ ...asset, width: 80, height: 1000 });
  expect(useEditor.getState().document).toMatchObject({
    width: 320,
    height: 180,
  });
  expect(useEditor.getState().document.layers).toHaveLength(1);
  expectContained(useEditor.getState().document);
});

it("fills a rectangular canvas with color bases, preserves overlays and supports undo", () => {
  const s = useEditor.getState();
  s.newCanvas(320, 180);
  s.addAsset(asset, { x: 160, y: 90 });
  s.setBase({
    ...asset,
    id: "background-color-black",
    width: 256,
    height: 256,
  });
  const before = useEditor.getState().document;
  expect(before.layers[0]).toMatchObject({
    kind: "base",
    width: 320,
    height: 180,
    x: 160,
    y: 90,
  });
  expect(before.layers).toHaveLength(2);
  s.setBase({
    ...asset,
    id: "background-color-white",
    width: 256,
    height: 256,
  });
  expect(useEditor.getState().document.layers).toHaveLength(2);
  s.undo();
  expect(useEditor.getState().document).toEqual(before);
});

it("preserves oversized assets and rotations instead of shrinking them", () => {
  const s = useEditor.getState();
  s.newCanvas(320, 180);
  for (const point of [
    { x: 0, y: 0 },
    { x: 320, y: 180 },
    { x: -100, y: 500 },
  ]) {
    s.addAsset(asset, point);
    const id = useEditor.getState().selectedId!;
    for (const rotation of [0, 35, 90, 135, -265, 360]) {
      s.updateLayer(id, {
        x: -50,
        y: 400,
        width: 4000,
        height: 2000,
        rotation,
      });
      const layer = useEditor
        .getState()
        .document.layers.find((l) => l.id === id)!;
      expect(layer.width / layer.height).toBeCloseTo(2);
      expect(layer.width).toBe(4000);
      expect(layer.height).toBe(2000);
    }
  }
});

it("preserves layer transforms on resize and project load with history", () => {
  const s = useEditor.getState();
  s.setBase(asset);
  s.addAsset(asset, { x: 600, y: 600 });
  const id = useEditor.getState().selectedId!;
  s.updateLayer(id, { locked: true });
  const previous = useEditor.getState().document;
  s.resize(64, 90);
  expect(useEditor.getState().document.layers[1].width).toBe(3000);
  expect(useEditor.getState().document.layers[1].height).toBe(1500);
  s.undo();
  expect(useEditor.getState().document).toEqual(previous);
  s.loadDocument({ ...previous, width: 64, height: 64 });
  expect(useEditor.getState().document.layers).toEqual(previous.layers);
});
