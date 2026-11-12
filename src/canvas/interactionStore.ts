import { create } from "zustand";
import { useEditor } from "../layers/store";

export const FIXED_TIMEOUT = 2000;
interface InteractionState {
  fixedId: string | null;
  expiresAt: number;
  operating: boolean;
  activate: (id: string) => void;
  touch: () => void;
  setOperating: (operating: boolean) => void;
  clear: () => void;
}
export const useCanvasInteraction = create<InteractionState>((set, get) => ({
  fixedId: null,
  expiresAt: 0,
  operating: false,
  activate: (fixedId) => {
    const editor = useEditor.getState();
    const layer = editor.document.layers.find((item) => item.id === fixedId);
    if (editor.selectedId === fixedId && layer?.visible && !layer.locked)
      set({ fixedId, expiresAt: Date.now() + FIXED_TIMEOUT, operating: false });
  },
  touch: () => {
    if (get().fixedId) set({ expiresAt: Date.now() + FIXED_TIMEOUT });
  },
  setOperating: (operating) => set({ operating }),
  clear: () => set({ fixedId: null, expiresAt: 0, operating: false }),
}));

let expiry: ReturnType<typeof setTimeout> | undefined;
useCanvasInteraction.subscribe((state) => {
  clearTimeout(expiry);
  if (state.fixedId && !state.operating)
    expiry = setTimeout(
      () => useCanvasInteraction.getState().clear(),
      Math.max(0, state.expiresAt - Date.now()),
    );
});
useEditor.subscribe((next, previous) => {
  const interaction = useCanvasInteraction.getState();
  if (!interaction.fixedId) return;
  const layer = next.document.layers.find(
    (item) => item.id === interaction.fixedId,
  );
  if (
    next.selectedId !== previous.selectedId ||
    !layer?.visible ||
    layer.locked
  )
    interaction.clear();
});
