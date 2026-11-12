import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useCanvasInteraction as interaction } from "./interactionStore";
import { useEditor } from "../layers/store";
import type { ImageLayer } from "../shared/types";
const layer: ImageLayer = {
  id: "target",
  name: "target",
  kind: "asset",
  imagePath: "a",
  x: 20,
  y: 20,
  width: 10,
  height: 10,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
};
beforeEach(() => {
  vi.useFakeTimers();
  interaction.getState().clear();
  useEditor
    .getState()
    .loadDocument({ name: "test", width: 64, height: 64, layers: [layer] });
  useEditor.getState().select(layer.id);
});
afterEach(() => {
  interaction.getState().clear();
  vi.useRealTimers();
});
it("expires after two idle seconds without changing history", () => {
  interaction.getState().activate(layer.id);
  vi.advanceTimersByTime(1999);
  expect(interaction.getState().fixedId).toBe(layer.id);
  vi.advanceTimersByTime(1);
  expect(interaction.getState().fixedId).toBeNull();
  expect(useEditor.getState().past).toHaveLength(0);
});
it("pauses during a long gesture and starts two fresh seconds at its end", () => {
  interaction.getState().activate(layer.id);
  interaction.getState().setOperating(true);
  vi.advanceTimersByTime(8000);
  expect(interaction.getState().fixedId).toBe(layer.id);
  interaction.getState().touch();
  interaction.getState().setOperating(false);
  vi.advanceTimersByTime(1500);
  interaction.getState().touch();
  vi.advanceTimersByTime(1999);
  expect(interaction.getState().fixedId).toBe(layer.id);
  vi.advanceTimersByTime(1);
  expect(interaction.getState().fixedId).toBeNull();
});
it.each([{ visible: false }, { locked: true }])(
  "rejects invalid targets and clears when eligibility changes",
  (patch) => {
    interaction.getState().activate("missing");
    expect(interaction.getState().fixedId).toBeNull();
    interaction.getState().activate(layer.id);
    useEditor.getState().updateLayer(layer.id, patch);
    expect(interaction.getState().fixedId).toBeNull();
    interaction.getState().activate(layer.id);
    expect(interaction.getState().fixedId).toBeNull();
  },
);
it.each(["select", "delete", "load", "new", "undo"])(
  "clears on %s",
  (action) => {
    interaction.getState().activate(layer.id);
    const editor = useEditor.getState();
    if (action === "select") editor.select(null);
    if (action === "delete") editor.deleteLayer(layer.id);
    if (action === "load") editor.loadDocument(editor.document);
    if (action === "new") editor.newCanvas(64, 64);
    if (action === "undo") {
      editor.updateLayer(layer.id, { x: 30 });
      editor.undo();
    }
    expect(interaction.getState().fixedId).toBeNull();
  },
);
