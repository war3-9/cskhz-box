import { beforeEach, expect, it } from "vitest";
import { emptyDocument, useEditor } from "../store";
import { defaultEffects } from "../effects";
import { useLayerDraft, previewLayer } from "./draftStore";
import { projectSchema } from "../../project/schema";
import { distanceField } from "./render/distance";

beforeEach(() => {
  useEditor.getState().loadDocument(emptyDocument());
  useEditor.getState().newCanvas(256, 256);
  useLayerDraft.getState().clear();
  useEditor
    .getState()
    .addAsset(
      {
        id: "asset",
        name: "图层",
        categoryId: "c",
        groupId: "g",
        source: "user",
        imagePath: "data:image/png;base64,AAAA",
        thumbnailPath: "",
        width: 128,
        height: 128,
      },
      { x: 128, y: 128 },
    );
});
it("keeps previews outside document/history and drops stale previews", () => {
  const editor = useEditor.getState();
  const layer = editor.document.layers[0];
  useLayerDraft
    .getState()
    .preview(layer, { opacity: 0.3, effects: defaultEffects() });
  expect(previewLayer(layer).opacity).toBe(0.3);
  expect(useEditor.getState().document).toBe(editor.document);
  expect(useEditor.getState().past).toBe(editor.past);
  editor.updateLayer(layer.id, { rotation: 45 });
  expect(previewLayer(useEditor.getState().document.layers[0]).opacity).toBe(1);
  useLayerDraft.getState().clear();
  expect(previewLayer(layer)).toBe(layer);
});
it("styles persist with original bytes and undo/redo while locked layers reject them", () => {
  const layer = useEditor.getState().document.layers[0];
  const effects = defaultEffects();
  effects.stroke = {
    ...effects.stroke,
    enabled: true,
    position: "inside",
    spread: 7,
  };
  effects.gradientOverlay = {
    ...effects.gradientOverlay,
    enabled: true,
    type: "radial",
  };
  const editor = useEditor.getState();
  const count = editor.past.length;
  editor.updateLayer(layer.id, { effects, opacity: 0.4, blendMode: "screen" });
  const parsed = projectSchema.parse({
    version: 1,
    document: useEditor.getState().document,
    library: { assets: [], categories: [] },
  });
  expect(parsed.document.layers[0]).toMatchObject({
    effects,
    opacity: 0.4,
    blendMode: "screen",
    imagePath: layer.imagePath,
  });
  expect(useEditor.getState().past).toHaveLength(count + 1);
  editor.undo();
  expect(useEditor.getState().document.layers[0]).toEqual(layer);
  editor.redo();
  editor.updateLayer(layer.id, { locked: true });
  const locked = useEditor.getState().document;
  editor.updateLayer(layer.id, { opacity: 0.1 });
  expect(useEditor.getState().document).toBe(locked);
});
it("rejects invalid effects/modes and supports old projects without styles", () => {
  const document = useEditor.getState().document;
  const project = {
    version: 1,
    document,
    library: { assets: [], categories: [] },
  };
  expect(projectSchema.safeParse(project).success).toBe(true);
  const effects = defaultEffects();
  effects.stroke.spread = -1;
  expect(() =>
    useEditor.getState().updateLayer(document.layers[0].id, { effects }),
  ).toThrow();
  expect(
    projectSchema.safeParse({
      ...project,
      document: { ...document, layers: [{ ...document.layers[0], effects }] },
    }).success,
  ).toBe(false);
  expect(
    projectSchema.safeParse({
      ...project,
      document: {
        ...document,
        layers: [{ ...document.layers[0], blendMode: "bad" }],
      },
    }).success,
  ).toBe(false);
});
it("matches brute-force Euclidean distances for opaque/transparent masks", () => {
  const width = 7,
    height = 5;
  const alpha = Uint8Array.from({ length: width * height }, (_, i) =>
    [8, 10, 17, 26].includes(i) ? 255 : 0,
  );
  for (const inside of [true, false]) {
    const result = distanceField(alpha, width, height, inside);
    for (let i = 0; i < alpha.length; i++) {
      const candidates = Array.from(alpha, (value, j) =>
        value > 0 === inside
          ? Math.hypot(
              (i % width) - (j % width),
              Math.floor(i / width) - Math.floor(j / width),
            )
          : Infinity,
      );
      expect(result[i]).toBeCloseTo(Math.min(...candidates), 5);
    }
  }
  expect(distanceField(new Uint8Array(9), 3, 3, true)[4]).toBeGreaterThan(
    100000,
  );
});
