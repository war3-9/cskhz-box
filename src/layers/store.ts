import { create } from "zustand";
import type { Asset, EditorDocument, ImageLayer, TextLayerData } from "../shared/types";
import { appendSnapshot } from "../history/snapshots";
import { validateLayer } from "./utils/bounds";
import { validCanvasSize } from "../canvas/dimensions";

export const emptyDocument = (): EditorDocument => ({
  name: "未命名作品",
  canvasCreated: false,
  width: 768,
  height: 768,
  layers: [],
});
interface EditorState {
  document: EditorDocument;
  selectedId: string | null;
  past: EditorDocument[];
  future: EditorDocument[];
  select: (id: string | null) => void;
  updateLayer: (id: string, patch: Partial<ImageLayer>) => void;
  addAsset: (asset: Asset, point: { x: number; y: number }, text?: TextLayerData) => void;
  addFillLayer: (asset: Asset) => void;
  setBase: (asset: Asset) => void;
  deleteLayer: (id: string) => void;
  moveLayer: (id: string, targetId: string, position?: 'before' | 'after') => void;
  loadDocument: (document: EditorDocument) => void;
  restoreSession: (snapshot: EditorSnapshot) => void;
  resize: (width: number, height: number) => void;
  newCanvas: (width: number, height: number) => void;
  rename: (name: string) => void;
  undo: () => void;
  redo: () => void;
  duplicateLayer: (id: string) => void;
  pasteLayer: () => void;
}
export type EditorSnapshot = Pick<EditorState, "document" | "selectedId" | "past" | "future">;
export const useEditor = create<EditorState>((set, get) => {
  let clipboard: ImageLayer | null = null;
  const commit = (document: EditorDocument, selectedId = get().selectedId) =>
    set((s) => ({
      document,
      selectedId,
      past: appendSnapshot(s.past, s.document),
      future: [],
    }));
  return {
    document: emptyDocument(),
    selectedId: null,
    past: [],
    future: [],
    select: (selectedId) => set({ selectedId }),
    updateLayer: (id, patch) => {
      const s = get();
      const item = s.document.layers.find((l) => l.id === id);
      if (
        !item ||
        (item.locked &&
          Object.keys(patch).some(
            (k) => !["locked", "visible", "name"].includes(k),
          ))
      )
        return;
      const next = validateLayer({ ...item, ...patch });
      if (JSON.stringify(item) === JSON.stringify(next)) return;
      commit({
        ...s.document,
        layers: s.document.layers.map((l) => (l.id === id ? next : l)),
      });
    },
    addAsset: (asset, point, text) => {
      const s = get();
      if (s.document.canvasCreated === false || asset.kind === "font") return;
      const layer: ImageLayer = {
        id: crypto.randomUUID(),
        name: asset.name,
        kind: "asset",
        assetId: asset.id,
        imagePath: asset.imagePath,
        x: point.x,
        y: point.y,
        width: asset.width,
        height: asset.height,
        rotation: 0,
        flipX: false,
        flipY: false,
        effects: undefined,
        opacity: 1,
        visible: true,
        locked: false,
        ...(text ? { text } : {}),
      };
      const layers = [...s.document.layers];
      const index = layers.findIndex((l) => l.id === s.selectedId);
      layers.splice(
        index < 0 ? layers.length : index + 1,
        0,
        validateLayer(layer),
      );
      commit({ ...s.document, layers }, layer.id);
    },
    addFillLayer: (asset) => {
      const { width, height } = get().document;
      get().addAsset({ ...asset, width, height }, { x: width / 2, y: height / 2 });
    },
    setBase: (asset) => {
      const s = get();
      if (s.document.canvasCreated === false || asset.kind === "font") return;
      const existing = s.document.layers.find((l) => l.kind === "base");
      const { width, height } = s.document;
      const fit = Math.min(width / asset.width, height / asset.height);
      const base: ImageLayer = {
        id: existing?.id ?? crypto.randomUUID(),
        name: `底图 · ${asset.name}`,
        kind: "base",
        assetId: asset.id,
        imagePath: asset.imagePath,
        x: width / 2,
        y: height / 2,
        width: asset.id.startsWith("background-color-")
          ? width
          : asset.width * fit,
        height: asset.id.startsWith("background-color-")
          ? height
          : asset.height * fit,
        rotation: 0,
        flipX: false,
        flipY: false,
        effects: undefined,
        opacity: 1,
        visible: true,
        locked: false,
      };
      commit(
        {
          ...s.document,
          width,
          height,
          layers: [base, ...s.document.layers.filter((l) => l.kind !== "base")],
        },
        base.id,
      );
    },
    deleteLayer: (id) => {
      const s = get();
      if (s.document.layers.find((l) => l.id === id)?.locked) return;
      commit(
        { ...s.document, layers: s.document.layers.filter((l) => l.id !== id) },
        null,
      );
    },
    moveLayer: (id, targetId, position) => {
      const s = get();
      const layers = [...s.document.layers];
      const from = layers.findIndex((l) => l.id === id);
      const to = layers.findIndex((l) => l.id === targetId);
      if (
        from < 0 ||
        to < 0 ||
        from === to ||
        layers[from].kind === "base" ||
        (layers[to].kind === "base" && position !== 'before') ||
        layers[from].locked
      )
        return;
      const [layer] = layers.splice(from, 1);
      const insertion = position ? layers.findIndex(item => item.id === targetId) + (position === 'before' ? 1 : 0) : to;
      layers.splice(insertion, 0, layer);
      if (layers.every((item, index) => item === s.document.layers[index])) return;
      commit({ ...s.document, layers });
    },
    loadDocument: (document) =>
      set({
        document: {
          ...document,
          canvasCreated: document.canvasCreated ?? true,
          layers: document.layers.map(validateLayer),
        },
        selectedId: null,
        past: [],
        future: [],
      }),
    restoreSession: (snapshot) => set(snapshot),
    resize: (width, height) => {
      if (!validCanvasSize(width, height)) return;
      const document = get().document;
      if (
        document.canvasCreated &&
        width === document.width &&
        height === document.height
      )
        return;
      const canvas = { ...document, width, height, canvasCreated: true };
      commit({
        ...canvas,
        layers: document.layers,
      });
    },
    newCanvas: (width, height) => {
      if (validCanvasSize(width, height))
        commit(
          { ...emptyDocument(), width, height, canvasCreated: true },
          null,
        );
    },
    rename: (name) => {
      if (name.trim() && name !== get().document.name)
        commit({ ...get().document, name: name.trim() });
    },
      undo: () =>
      set((s) => {
        const previous = s.past.at(-1);
        if (!previous) return s;
        return {
          document: previous,
          selectedId: null,
          past: s.past.slice(0, -1),
          future: [s.document, ...s.future],
        };
      }),
      redo: () =>
      set((s) => {
        const next = s.future[0];
        if (!next) return s;
        return {
          document: next,
          selectedId: null,
          past: appendSnapshot(s.past, s.document),
          future: s.future.slice(1),
        };
      }),
    duplicateLayer: (id) => {
      const layer = get().document.layers.find((item) => item.id === id);
      if (layer) clipboard = structuredClone(layer);
    },
    pasteLayer: () => {
      const s = get();
      if (!clipboard || clipboard.kind === "base") return;
      const copy = { ...structuredClone(clipboard), id: crypto.randomUUID(), name: `${clipboard.name} 副本`, x: clipboard.x + 12, y: clipboard.y + 12 };
      const index = s.document.layers.findIndex((l) => l.id === s.selectedId);
      const layers = [...s.document.layers];
      layers.splice(Math.max(1, index + 1), 0, copy);
      commit({ ...s.document, layers }, copy.id);
    },
  };
});
