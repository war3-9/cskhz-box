import { expect, it } from "vitest";
import { projectSchema } from "./schema";
import { emptyDocument } from "../layers/store";
import { useEditor } from "../layers/store";
const base = {
  version: 1,
  document: emptyDocument(),
  library: { categories: [], assets: [] },
};
it("preserves editable text settings and rejects malformed settings", () => {
  const s = useEditor.getState();
  s.newCanvas(256, 256);
  s.addAsset({ id: "rendered", name: "中文文字", categoryId: "fonts", groupId: "fonts", source: "builtin", imagePath: "/assets/fire-1.png", thumbnailPath: "/assets/fire-1.png", width: 122, height: 80 }, { x: 128, y: 128 },
    { fontId: "font-1", content: "雷鸣塔", color: "#ff0000", fontSize: 24 });
  const project = { ...base, document: s.document };
  project.document = useEditor.getState().document;
  const parsed = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  expect(parsed.document.layers[0].text).toEqual({ fontId: "font-1", content: "雷鸣塔", color: "#ff0000", fontSize: 24 });
  const effects = {
    ...parsed.document.layers[0].text!,
    stroke: { enabled: true, color: "#ffffff", width: 3.5 },
    gradient: { enabled: true, startColor: "#ff0000", endColor: "#0000ff", angle: 90 },
  };
  const styled = { ...project, document: { ...project.document, layers: [{ ...project.document.layers[0], text: effects }] } };
  expect(projectSchema.parse(JSON.parse(JSON.stringify(styled))).document.layers[0].text).toEqual(effects);
  for (const text of [
    { ...effects, stroke: { ...effects.stroke, width: -1 } },
    { ...effects, stroke: { ...effects.stroke, width: 33 } },
    { ...effects, gradient: { ...effects.gradient, angle: Infinity } },
    { ...effects, gradient: { ...effects.gradient, angle: 361 } },
    { ...effects, gradient: { ...effects.gradient, endColor: "wrong" } },
  ]) expect(projectSchema.safeParse({ ...styled, document: { ...styled.document, layers: [{ ...styled.document.layers[0], text }] } }).success).toBe(false);
  s.updateLayer(useEditor.getState().selectedId!, { text: { ...parsed.document.layers[0].text!, color: "#00ff00" } });
  s.undo();
  expect(useEditor.getState().document.layers[0].text?.color).toBe("#ff0000");
  s.redo();
  expect(useEditor.getState().document.layers[0].text?.color).toBe("#00ff00");
  for (const text of [{ fontId: "font-1", content: "a", color: "invalid", fontSize: 24 }, { fontId: "font-1", content: "a", color: "#ff0000", fontSize: 12.5 }]) {
    expect(projectSchema.safeParse({ ...project, document: { ...project.document, layers: [{ ...project.document.layers[0], text }] } }).success).toBe(false);
  }
});
it("rejects unsupported versions, unreasonable dimensions, orphan categories and remote image paths", () => {
  expect(projectSchema.safeParse(base).success).toBe(true);
  expect(projectSchema.safeParse({ ...base, version: 2 }).success).toBe(false);
  expect(
    projectSchema.safeParse({
      ...base,
      document: { ...base.document, width: 99999 },
    }).success,
  ).toBe(false);
  expect(
    projectSchema.safeParse({
      ...base,
      library: {
        ...base.library,
        categories: [
          {
            id: "a",
            name: "孤儿",
            parentId: "missing",
            source: "user",
            thumbnail: "",
          },
        ],
      },
    }).success,
  ).toBe(false);
  expect(
    projectSchema.safeParse({
      ...base,
      library: {
        ...base.library,
        categories: [
          {
            id: "a",
            name: "危险引用",
            parentId: null,
            source: "user",
            thumbnail: "https://example.com/a.png",
          },
        ],
      },
    }).success,
  ).toBe(false);
});
