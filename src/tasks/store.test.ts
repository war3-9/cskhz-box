import { beforeEach, expect, it } from "vitest";
import { useEditor, emptyDocument } from "../layers/store";
import { isTaskDirty, useTasks } from "./store";
import { useCanvasInteraction } from "../canvas/interactionStore";
import type { EditorDocument } from "../shared/types";

const document = (name: string): EditorDocument => ({
  ...emptyDocument(),
  name,
  width: 122,
  height: 122,
  canvasCreated: true,
  layers: [
    {
      id: "base",
      name: "底图",
      kind: "base",
      imagePath: "data:image/png;base64,AAAA",
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
beforeEach(() => useTasks.getState().restore([], null));
it("requires a task name and assigns duplicate suffixes", () => {
  useTasks.getState().createTask({ name: "   ", width: 128, height: 128 });
  expect(useTasks.getState().tasks).toHaveLength(0);
  for (let index = 0; index < 3; index++)
    useTasks.getState().createTask({ name: "装备", width: 128, height: 128 });
  expect(useTasks.getState().tasks.map((task) => task.document.name)).toEqual([
    "装备",
    "装备 2",
    "装备 3",
  ]);
});

it("keeps independent layer bytes, selection and undo/redo across task switches", () => {
  const first = useTasks.getState().open(document("A"), true);
  useEditor.getState().select("base");
  useEditor.getState().updateLayer("base", { x: 20 });
  const second = useTasks.getState().open(document("B"), true);
  useEditor.getState().updateLayer("base", { opacity: 0.5 });
  useTasks.getState().activate(first);
  expect(useEditor.getState().document.layers[0].x).toBe(20);
  expect(useEditor.getState().selectedId).toBe("base");
  useEditor.getState().undo();
  expect(useEditor.getState().document.layers[0].x).toBe(61);
  expect(isTaskDirty(useTasks.getState().tasks[0])).toBe(false);
  useTasks.getState().activate(second);
  expect(useEditor.getState().document.layers[0].opacity).toBe(0.5);
  expect(useEditor.getState().future).toHaveLength(0);
  useTasks.getState().activate(first);
  useEditor.getState().redo();
  expect(useEditor.getState().document.layers[0].x).toBe(20);
  expect(useEditor.getState().document.layers[0].imagePath).toBe(
    document("A").layers[0].imagePath,
  );
});

it("creates an additional canvas and rejects invalid sizes", () => {
  const first = useTasks.getState().open(document("A"));
  useTasks.getState().createCanvas(0, 300);
  expect(useTasks.getState().tasks).toHaveLength(1);
  useTasks.getState().createCanvas(300, 200);
  expect(useTasks.getState().tasks).toHaveLength(2);
  expect(useEditor.getState().document.width).toBe(300);
  expect(useEditor.getState().document.layers).toHaveLength(0);
  useTasks.getState().activate(first);
  expect(useEditor.getState().document.layers).toHaveLength(1);
  useTasks.getState().createCanvas(300, 200);
  expect(useEditor.getState().document.name).toBe("未命名作品 2");
});

it("closes inactive and final tasks without replacing other documents", () => {
  const first = useTasks.getState().open(document("A"));
  const second = useTasks.getState().open(document("B"));
  useTasks.getState().close(first);
  expect(useTasks.getState().activeId).toBe(second);
  expect(useEditor.getState().document.name).toBe("B");
  useTasks.getState().close(second);
  expect(useTasks.getState().activeId).toBeNull();
  expect(useEditor.getState().document.canvasCreated).toBe(false);
  expect(useEditor.getState().document.layers).toHaveLength(0);
  expect(useEditor.getState().past).toHaveLength(0);
});

it("clears temporary fixed selection on task switch with duplicate layer IDs", () => {
  const first = useTasks.getState().open(document("A"));
  const second = useTasks.getState().open(document("B"));
  useEditor.getState().select("base");
  useCanvasInteraction.getState().activate("base");
  useTasks.getState().activate(first);
  expect(useCanvasInteraction.getState().fixedId).toBeNull();
  useTasks.getState().close(first);
  expect(useTasks.getState().activeId).toBe(second);
});

it("saving an older snapshot does not mark later edits as saved", () => {
  const id = useTasks.getState().open(document("A"));
  const original = useEditor.getState().document;
  useEditor.getState().rename("later");
  useTasks.getState().markSaved(id, original);
  expect(isTaskDirty(useTasks.getState().tasks[0])).toBe(true);
  useTasks.getState().markSaved(id, useEditor.getState().document);
  expect(isTaskDirty(useTasks.getState().tasks[0])).toBe(false);
});
