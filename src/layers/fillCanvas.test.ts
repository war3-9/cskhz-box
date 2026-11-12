import { beforeEach, expect, it } from "vitest";
import { fillLayerCanvas } from "./fillCanvas";
import { useEditor } from "./store";
import { useLibrary } from "../assets/store";
import type { ImageLayer, Asset } from "../shared/types";

const image: ImageLayer = {
  id: "picture",
  name: "picture",
  kind: "asset",
  imagePath: "data:image/png;base64,YQ==",
  x: -50,
  y: 400,
  width: 100,
  height: 60,
  rotation: 37,
  opacity: 0.4,
  visible: false,
  locked: false,
};
beforeEach(() => {
  useLibrary.getState().setLibrary({ categories: [], assets: [] });
  useEditor
    .getState()
    .loadDocument({ name: "fill", width: 320, height: 180, layers: [image] });
});
it("fills a rectangular canvas in one history entry and preserves image bytes and layer flags", () => {
  const editor = useEditor.getState();
  const original = editor.document;
  fillLayerCanvas(image.id);
  const filled = useEditor.getState().document;
  expect(filled.layers[0]).toEqual({
    ...image,
    x: 160,
    y: 90,
    width: 320,
    height: 180,
    rotation: 0,
  });
  expect(useEditor.getState().past).toHaveLength(1);
  editor.undo();
  expect(useEditor.getState().document).toEqual(original);
  editor.redo();
  expect(useEditor.getState().document).toEqual(filled);
  fillLayerCanvas(image.id);
  expect(useEditor.getState().past).toHaveLength(1);
});
it("fills a base without reordering it or changing other layers", () => {
  const editor = useEditor.getState();
  editor.loadDocument({
    ...editor.document,
    layers: [{ ...image, id: "base", kind: "base" }, image],
  });
  fillLayerCanvas("base");
  expect(useEditor.getState().document.layers.map((layer) => layer.id)).toEqual(
    ["base", image.id],
  );
  expect(useEditor.getState().document.layers[1]).toEqual(image);
});
it.each(["locked", "text", "legacy", "missing", "no-canvas"])(
  "ignores %s targets",
  (scenario) => {
    const editor = useEditor.getState();
    let layer = image;
    if (scenario === "locked") layer = { ...image, locked: true };
    if (scenario === "text")
      layer = {
        ...image,
        text: {
          fontId: "unknown",
          content: "text",
          fontSize: 20,
          color: "#ffffff",
        },
      };
    if (scenario === "legacy") {
      useLibrary
        .getState()
        .setLibrary({
          categories: [],
          assets: [{ id: "font", name: "优设", kind: "font" } as Asset],
        });
      layer = { ...image, name: "优设 · 旧文字" };
    }
    editor.loadDocument({
      ...editor.document,
      canvasCreated: scenario !== "no-canvas",
      layers: [layer],
    });
    const original = useEditor.getState().document;
    fillLayerCanvas(scenario === "missing" ? "missing" : image.id);
    expect(useEditor.getState().document).toBe(original);
    expect(useEditor.getState().past).toHaveLength(0);
  },
);
