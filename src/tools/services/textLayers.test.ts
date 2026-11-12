import { beforeEach, expect, it, vi } from "vitest";
import type { Asset, TextLayerData } from "../../shared/types";
import { useEditor } from "../../layers/store";
import { projectSchema } from "../../project/schema";
import { saveTextLayer } from "./textLayers";

vi.mock("./fontText", () => ({
  renderFontText: vi.fn(async () => ({
    imagePath: "data:image/png;base64,BBBB",
    width: 200,
    height: 100,
  })),
}));
vi.mock("../../shared/image", () => ({
  loadImage: vi.fn(async () => ({ width: 100, height: 50 })),
}));

const font: Asset = {
  id: "font",
  name: "测试字体",
  kind: "font",
  source: "builtin",
  groupId: "fonts",
  categoryId: "fonts",
  imagePath: "data:image/png;base64,AAAA",
  thumbnailPath: "data:image/png;base64,AAAA",
  width: 100,
  height: 50,
};
const text: TextLayerData = {
  fontId: font.id,
  content: "原文字",
  fontSize: 32,
  color: "#000000",
};

beforeEach(() => useEditor.getState().newCanvas(256, 256));

it("assigns a default name when creating a text layer", async () => {
  await saveTextLayer(font, text);
  expect(useEditor.getState().document.layers[0]).toMatchObject({
    name: "测试字体 · 原文字",
    text,
  });
});

it.each(["装备名称", "测试字体 · 原文字", "旧作品自定义名称 · 后缀"])(
  "preserves saved name %s through text editing, history and project round trips",
  async (name) => {
    const editor = useEditor.getState();
    // Existing projects have no separate custom-name flag.
    editor.addAsset({ ...font, kind: "image", name }, { x: 80, y: 90 }, text);
    const id = useEditor.getState().selectedId!;
    editor.updateLayer(id, { width: 150, height: 75, rotation: 25 });
    const before = useEditor.getState().document;
    const past = useEditor.getState().past.length;
    const settings = {
      ...text,
      content: "修改后的文字",
      fontSize: 48,
      color: "#ff0000",
      stroke: { enabled: true, color: "#ffffff", width: 3 },
      gradient: { enabled: true, startColor: "#ff0000", endColor: "#0000ff", angle: 90 },
    };
    await saveTextLayer(font, settings, id);
    const edited = useEditor.getState().document;
    expect(edited.layers[0]).toMatchObject({
      id, name, text: settings, width: 300, height: 150,
      x: 80, y: 90, rotation: 25, imagePath: "data:image/png;base64,BBBB",
    });
    expect(useEditor.getState().past).toHaveLength(past + 1);
    editor.undo();
    expect(useEditor.getState().document).toEqual(before);
    editor.redo();
    expect(useEditor.getState().document).toEqual(edited);
    const saved = projectSchema.parse(JSON.parse(JSON.stringify({
      version: 1, document: edited, library: { categories: [], assets: [] },
    })));
    editor.loadDocument(saved.document);
    await saveTextLayer(font, { ...settings, content: "再次编辑" }, id);
    expect(useEditor.getState().document.layers[0].name).toBe(name);
  },
);

it("preserves a custom name when saving unchanged text", async () => {
  const editor = useEditor.getState();
  editor.addAsset({ ...font, kind: "image", name: "保留此名" }, { x: 80, y: 90 }, text);
  await saveTextLayer(font, text, useEditor.getState().selectedId!);
  expect(useEditor.getState().document.layers[0].name).toBe("保留此名");
});
