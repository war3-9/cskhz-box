import { expect, it } from "vitest";
import { loadTemplate } from "./templates";
import { useLibrary } from "../assets/store";
import { useEditor } from "../layers/store";
import { useUi } from "../app/uiStore";
import { useTasks } from "../tasks/store";
it("uses an editable template name and size without creating a blank task", () => {
  useTasks.getState().restore([], null);
  useTasks.getState().createTask({ name: "装备", width: 128, height: 128 });
  loadTemplate(
    {
      id: "named",
      name: "模板",
      updatedAt: 1,
      preview: "data:image/png;base64,AAAA",
      project: {
        version: 1,
        document: { name: "原名", width: 64, height: 64, layers: [] },
        library: { categories: [], assets: [] },
      },
    },
    "装备",
    { width: 300, height: 200 },
  );
  expect(useTasks.getState().tasks).toHaveLength(2);
  expect(useEditor.getState().document).toMatchObject({
    name: "装备 2",
    width: 300,
    height: 200,
  });
});

it("loads a template without leaving template view or discarding current user assets", () => {
  useTasks.getState().restore([], null);
  useTasks.getState().createCanvas(122, 122);
  useEditor.getState().rename("existing");
  const originalId = useTasks.getState().activeId!;
  const category = {
    id: "mine",
    name: "我的分类",
    parentId: null,
    source: "user" as const,
    thumbnail: "",
  };
  useLibrary.getState().setLibrary({ categories: [category], assets: [] });
  useUi.getState().setLibraryView("templates");
  loadTemplate({
    id: "template",
    name: "中文模板",
    updatedAt: 1,
    preview: "data:image/png;base64,AAAA",
    project: {
      version: 1,
      document: {
        name: "中文作品",
        canvasCreated: true,
        width: 64,
        height: 64,
        layers: [],
      },
      library: { categories: [], assets: [] },
    },
  });
  expect(useUi.getState().libraryView).toBe("templates");
  expect(useLibrary.getState().library.categories).toContainEqual(category);
  expect(useEditor.getState().document.width).toBe(64);
  expect(useTasks.getState().tasks).toHaveLength(2);
  useTasks.getState().activate(originalId);
  expect(useEditor.getState().document.name).toBe("existing");
  expect(useEditor.getState().document.width).toBe(122);
});
