import { useEffect } from "react";
import { useEditor } from "../layers/store";
import { useCanvasInteraction } from "../canvas/interactionStore";
import { useBucket } from "../canvas/bucketStore";
import { useBatchState } from "../export/batchState";
import { useShortcutSettings } from "../settings/shortcutStore";
import { shortcutMatches } from "../settings/shortcutConfig";
export function useShortcuts(activateSelection: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const clear = () => {
      useCanvasInteraction.getState().clear();
      useBucket.getState().clear();
    };
    const outside = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".canvas-viewport, .bucket-tool")
      )
        useCanvasInteraction.getState().clear();
    };
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return;
      if (useBatchState.getState().busy) {
        event.preventDefault();
        return;
      }
      if (
        (event.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable],dialog",
        )
      )
        return;
      const state = useEditor.getState();
      const action = useShortcutSettings
        .getState()
        .bindings.find((binding) =>
          shortcutMatches(event, binding.keys),
        )?.action;
      if (action) event.preventDefault();
      if (action === "undo") {
        event.preventDefault();
        state.undo();
      }
      if (action === "redo" || action === "redoAlt") {
        event.preventDefault();
        state.redo();
      }
      if (action === "duplicate" && state.selectedId) {
        event.preventDefault();
        state.duplicateLayer(state.selectedId);
      }
      if (action === "paste") {
        event.preventDefault();
        state.pasteLayer();
      }
      if (action === "fixLayer") {
        event.preventDefault();
        const layer = state.document.layers.find(
          (item) => item.id === state.selectedId,
        );
        if (layer?.visible && !layer.locked) {
          activateSelection();
          useCanvasInteraction.getState().activate(layer.id);
        }
      }
      if (action === "delete" && state.selectedId)
        state.deleteLayer(state.selectedId);
      if (event.key === "Escape") {
        useCanvasInteraction.getState().clear();
        useBucket.getState().clear();
        state.select(null);
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", clear);
    return () => {
      clear();
      window.removeEventListener("keydown", handler);
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", clear);
    };
  }, [activateSelection, active]);
}
