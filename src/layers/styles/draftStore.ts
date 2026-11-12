import { create } from "zustand";
import type { ImageLayer } from "../../shared/types";

interface DraftState {
  original: ImageLayer | null;
  patch: Partial<ImageLayer>;
  preview: (layer: ImageLayer, patch: Partial<ImageLayer>) => void;
  clear: () => void;
}
export const useLayerDraft = create<DraftState>((set) => ({
  original: null,
  patch: {},
  preview: (original, patch) => set({ original, patch }),
  clear: () => set({ original: null, patch: {} }),
}));
export function previewLayer(layer: ImageLayer): ImageLayer {
  const draft = useLayerDraft.getState();
  return draft.original === layer ? { ...layer, ...draft.patch } : layer;
}
