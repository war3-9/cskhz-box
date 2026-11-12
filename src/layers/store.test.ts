import { beforeEach, describe, expect, it } from "vitest";
import { emptyDocument, useEditor } from "./store";
import type { Asset } from "../shared/types";
const asset: Asset = {
  id: "fire-1",
  name: "火焰",
  categoryId: "fire",
  groupId: "rank",
  source: "builtin",
  imagePath: "/assets/fire-1.png",
  thumbnailPath: "/assets/fire-1.png",
  width: 480,
  height: 480,
};
beforeEach(() => {
  useEditor.getState().loadDocument(emptyDocument());
  useEditor.getState().newCanvas(768, 768);
});
describe("document editing", () => {
  it('renames one of two identical layers with one history entry, including locked layers', () => {
    const s = useEditor.getState();
    s.addAsset(asset, { x: 32, y: 32 });
    s.addAsset(asset, { x: 32, y: 32 });
    const id = useEditor.getState().selectedId!;
    s.updateLayer(id, { locked: true });
    const before = useEditor.getState().document;
    const past = useEditor.getState().past.length;
    s.updateLayer(id, { name: '装备主体' });
    expect(useEditor.getState().document.layers.map(layer => layer.name)).toEqual(['火焰', '装备主体']);
    expect(useEditor.getState().document.layers[1]).toEqual({ ...before.layers[1], name: '装备主体' });
    expect(useEditor.getState().past.length).toBe(past + 1);
    s.updateLayer(id, { name: '装备主体' });
    expect(useEditor.getState().past.length).toBe(past + 1);
    s.undo(); expect(useEditor.getState().document).toEqual(before);
    s.redo(); expect(useEditor.getState().document.layers[1].name).toBe('装备主体');
    s.loadDocument(JSON.parse(JSON.stringify(useEditor.getState().document)));
    expect(useEditor.getState().document.layers[1]).toMatchObject({ id, name: '装备主体', locked: true });
  });
  it("keeps 122px assets, off-canvas transforms, and saved sizes through resize and history", () => {
    const s = useEditor.getState();
    s.newCanvas(64, 64);
    s.addAsset({ ...asset, width: 122, height: 122 }, { x: 32, y: 32 });
    const id = useEditor.getState().selectedId!;
    expect(useEditor.getState().document.layers[0]).toMatchObject({ width: 122, height: 122 });
    s.updateLayer(id, { x: -20, y: 150, width: 200, height: 200, rotation: 45 });
    const previous = useEditor.getState().document;
    s.resize(96, 96);
    expect(useEditor.getState().document.layers).toEqual(previous.layers);
    s.undo();
    expect(useEditor.getState().document).toEqual(previous);
    s.loadDocument(previous);
    expect(useEditor.getState().document.layers).toEqual(previous.layers);
    expect(() => s.updateLayer(id, { width: NaN })).toThrow();
  });
  it("requires a created canvas and restores the gate through undo and saved documents", () => {
    const s = useEditor.getState();
    s.loadDocument(emptyDocument());
    s.addAsset(asset, { x: 10, y: 10 });
    s.setBase(asset);
    expect(useEditor.getState().document.layers).toHaveLength(0);
    expect(useEditor.getState().past).toHaveLength(0);
    s.newCanvas(64, 64);
    s.undo();
    expect(useEditor.getState().document.canvasCreated).toBe(false);
    s.redo();
    s.setBase(asset);
    expect(useEditor.getState().document.layers).toHaveLength(1);
    s.loadDocument({ ...emptyDocument(), canvasCreated: undefined });
    expect(useEditor.getState().document.canvasCreated).toBe(true);
  });
  it("inserts directly above selection, preserves the base, and honors drop coordinates", () => {
    const s = useEditor.getState();
    s.setBase(asset);
    s.addAsset(asset, { x: 200, y: 180 });
    const first = useEditor.getState().selectedId!;
    s.addAsset({ ...asset, name: "冰霜" }, { x: 300, y: 280 });
    s.select(first);
    s.addAsset({ ...asset, name: "自然" }, { x: 240, y: 220 });
    const layers = useEditor.getState().document.layers;
    expect(layers.map((l) => l.name)).toEqual([
      "底图 · 火焰",
      "火焰",
      "自然",
      "冰霜",
    ]);
    expect(layers[2].x).toBe(240);
    expect(layers[2].y).toBe(220);
  });
  it("locks transform, deletion, and reorder without blocking unlock", () => {
    const s = useEditor.getState();
    s.addAsset(asset, { x: 100, y: 100 });
    const id = useEditor.getState().selectedId!;
    s.updateLayer(id, { locked: true });
    s.updateLayer(id, { rotation: 40 });
    s.deleteLayer(id);
    expect(useEditor.getState().document.layers[0].rotation).toBe(0);
    expect(useEditor.getState().document.layers).toHaveLength(1);
    s.updateLayer(id, { locked: false });
    s.updateLayer(id, { rotation: 40 });
    expect(useEditor.getState().document.layers[0].rotation).toBe(40);
  });
  it("undoes and redoes transforms and reorder, invalidates redo on new work", () => {
    const s = useEditor.getState();
    s.setBase(asset);
    s.addAsset(asset, { x: 40, y: 40 });
    const a = useEditor.getState().selectedId!;
    s.addAsset({ ...asset, name: "冰" }, { x: 50, y: 50 });
    const b = useEditor.getState().selectedId!;
    s.moveLayer(b, a);
    expect(useEditor.getState().document.layers[1].id).toBe(b);
    s.undo();
    expect(useEditor.getState().document.layers[1].id).toBe(a);
    s.redo();
    expect(useEditor.getState().document.layers[1].id).toBe(b);
    s.updateLayer(b, { opacity: 0.5, rotation: 90 });
    s.undo();
    expect(useEditor.getState().document.layers[1].opacity).toBe(1);
    s.redo();
    expect(useEditor.getState().document.layers[1].rotation).toBe(90);
    s.undo();
    s.updateLayer(a, { visible: false });
    expect(useEditor.getState().future).toHaveLength(0);
  });
  it("cannot reorder base above an overlay", () => {
    const s = useEditor.getState();
    s.setBase(asset);
    const base = useEditor.getState().selectedId!;
    s.addAsset(asset, { x: 100, y: 100 });
    s.moveLayer(base, useEditor.getState().selectedId!);
    expect(useEditor.getState().document.layers[0].kind).toBe("base");
  });
  it('places dragged layers before or after rows in display order, with one undoable change', () => {
    const s = useEditor.getState(); s.setBase(asset);
    for (const name of ['a', 'b', 'c']) s.addAsset({ ...asset, name }, { x: 64, y: 64 });
    const [base, a, b, c] = useEditor.getState().document.layers.map(layer => layer.id);
    const order = () => useEditor.getState().document.layers.map(layer => layer.id);
    const before = useEditor.getState().past.length;
    s.moveLayer(a, c, 'before');
    expect(order()).toEqual([base, b, c, a]);
    expect(useEditor.getState().past.length).toBe(before + 1);
    s.undo(); expect(order()).toEqual([base, a, b, c]);
    s.redo(); expect(order()).toEqual([base, b, c, a]);
    s.moveLayer(a, base, 'before'); expect(order()).toEqual([base, a, b, c]);
    s.moveLayer(c, a, 'after'); expect(order()).toEqual([base, c, a, b]);
    const stable = useEditor.getState().document, history = useEditor.getState().past.length;
    s.moveLayer(c, a, 'after'); s.moveLayer(a, base, 'after'); s.moveLayer(base, b, 'before');
    expect(useEditor.getState().document).toBe(stable);
    expect(useEditor.getState().past.length).toBe(history);
    s.updateLayer(a, { locked: true });
    const locked = useEditor.getState().document; s.moveLayer(a, b, 'before');
    expect(useEditor.getState().document).toBe(locked);
  });
});
