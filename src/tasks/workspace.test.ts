import { beforeEach, expect, it } from "vitest";
import { emptyDocument, useEditor } from "../layers/store";
import { useTasks } from "./store";
import {
  restoreWorkspace,
  serializeWorkspace,
  workspaceSchema,
} from "./workspace";
import type { ProjectFile } from "../shared/types";
import type { BuiltinLibrary } from "../assets/services/builtin";

const builtin: BuiltinLibrary = { categories: [], assets: [] };
const project = (): ProjectFile => ({
  version: 1,
  document: useEditor.getState().document,
  library: builtin,
});
beforeEach(() => useTasks.getState().restore([], null));

it("round trips all tasks and active selection with embedded image bytes", () => {
  const first = useTasks
    .getState()
    .open({ ...emptyDocument(), name: "A", canvasCreated: true }, true);
  useEditor.getState().rename("modified");
  const second = useTasks
    .getState()
    .open({ ...emptyDocument(), name: "B", canvasCreated: true }, true);
  const serialized = serializeWorkspace(project(), builtin);
  const restored = restoreWorkspace(JSON.stringify(serialized), builtin);
  expect(restored.activeId).toBe(second);
  expect(
    restored.entries.map((task) => [task.id, task.document.name, task.dirty]),
  ).toEqual([
    [first, "modified", true],
    [second, "B", false],
  ]);
  useTasks.getState().restore(restored.entries, restored.activeId);
  useTasks.getState().activate(first);
  expect(useEditor.getState().document.name).toBe("modified");
});

it("keeps zero-task sessions empty on reopen and migrates legacy workspaces", () => {
  expect(
    restoreWorkspace(
      JSON.stringify(serializeWorkspace(project(), builtin)),
      builtin,
    ).entries,
  ).toEqual([]);
  const legacy = {
    ...project(),
    document: { ...emptyDocument(), canvasCreated: true },
  };
  expect(
    restoreWorkspace(JSON.stringify(legacy), builtin).entries,
  ).toHaveLength(1);
});

it("protects and restores inactive builtin references while preserving user image bytes", () => {
  const pixels = "data:image/png;base64,AAAA";
  const userPixels = "data:image/png;base64,BBBB";
  const library: BuiltinLibrary = {
    categories: [{ id: "backgrounds", name: "底图", parentId: null, source: "builtin", thumbnail: "" }],
    assets: [
      {
        id: "built",
        name: "builtin",
        source: "builtin",
        categoryId: "backgrounds",
        groupId: "backgrounds",
        width: 122,
        height: 122,
        imagePath: pixels,
        thumbnailPath: pixels,
      },
    ],
  };
  const first = useTasks.getState().open({
    ...emptyDocument(),
    canvasCreated: true,
    layers: [
      {
        id: "base",
        name: "base",
        kind: "base",
        imagePath: pixels,
        x: 61,
        y: 61,
        width: 122,
        height: 122,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
      },
      {
        id: "user",
        name: "user",
        kind: "asset",
        imagePath: userPixels,
        x: 61,
        y: 61,
        width: 122,
        height: 122,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
      },
    ],
  });
  useTasks.getState().createCanvas(300, 300);
  const data = serializeWorkspace(project(), library);
  expect(data.session.tasks[0].document.layers[0].imagePath).toMatch(
    /^builtin:\/\//,
  );
  expect(data.session.tasks[0].document.layers[1].imagePath).toBe(userPixels);
  const restored = restoreWorkspace(JSON.stringify(data), library);
  expect(
    restored.entries
      .find((task) => task.id === first)
      ?.document.layers.map((layer) => layer.imagePath),
  ).toEqual([pixels, userPixels]);
});

it("rejects duplicate task IDs, dangling active IDs and invalid inactive layer order", () => {
  useTasks.getState().createCanvas(122, 122);
  const data = serializeWorkspace(project(), builtin);
  expect(
    workspaceSchema.safeParse({
      ...data,
      session: { ...data.session, activeId: "missing" },
    }).success,
  ).toBe(false);
  expect(
    workspaceSchema.safeParse({
      ...data,
      session: {
        ...data.session,
        tasks: [...data.session.tasks, ...data.session.tasks],
      },
    }).success,
  ).toBe(false);
  const layer = {
    id: "a",
    name: "A",
    kind: "base",
    imagePath: "data:image/png;base64,AAAA",
    x: 1,
    y: 1,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
  };
  data.session.tasks[0].document.layers = [
    layer as never,
    { ...layer, id: "b" } as never,
  ];
  expect(() => restoreWorkspace(JSON.stringify(data), builtin)).toThrow();
});
