import { beforeEach, expect, it } from "vitest";
import { useBucket } from "./bucketStore";
import { useTasks } from "../tasks/store";
import { useEditor } from "../layers/store";
import type { Asset } from "../shared/types";
const fill: Asset = {
  id: "fill",
  name: "填色 · #FF0000",
  groupId: "",
  categoryId: "",
  source: "user",
  imagePath: "data:image/png;base64,AAAA",
  thumbnailPath: "",
  width: 1,
  height: 1,
};
beforeEach(() => {
  useTasks.getState().restore([], null);
  useBucket.getState().clear();
});
it("toggles colors and clears activation across tasks", () => {
  useTasks.getState().createTask({ name: "A", width: 320, height: 180 });
  const first = useTasks.getState().activeId!;
  useBucket.getState().toggle();
  useBucket.getState().setColor("#ff0000");
  expect(useBucket.getState().active).toBe(true);
  expect(useBucket.getState().recent[0]).toBe("#ff0000");
  useTasks.getState().createTask({ name: "B", width: 320, height: 180 });
  expect(useBucket.getState().active).toBe(false);
  useBucket.getState().toggle();
  useTasks.getState().activate(first);
  expect(useBucket.getState().active).toBe(false);
});
it("commits centered canvas-sized image once above base with undo/redo", () => {
  useTasks.getState().createTask({ name: "A", width: 320, height: 180 });
  useEditor.getState().setBase(fill);
  const before = useEditor.getState().past.length;
  useEditor.getState().addFillLayer(fill);
  const layers = useEditor.getState().document.layers;
  expect(layers[0].kind).toBe("base");
  expect(layers[1]).toMatchObject({
    kind: "asset",
    x: 160,
    y: 90,
    width: 320,
    height: 180,
    rotation: 0,
    imagePath: fill.imagePath,
  });
  expect(useEditor.getState().past.length).toBe(before + 1);
  useEditor.getState().undo();
  expect(useEditor.getState().document.layers).toHaveLength(1);
  useEditor.getState().redo();
  expect(useEditor.getState().document.layers).toEqual(layers);
});
