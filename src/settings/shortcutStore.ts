import { create } from "zustand";
import {
  defaultShortcuts,
  loadShortcuts,
  saveShortcuts,
  shortcutError,
  type ShortcutAction,
  type ShortcutBinding,
} from "./shortcutConfig";

export const useShortcutSettings = create<{
  bindings: ShortcutBinding[];
  update: (action: ShortcutAction, keys: string) => void;
  reset: () => void;
}>((set, get) => ({
  bindings: loadShortcuts(),
  update: (action, keys) => {
    const invalid = shortcutError(keys);
    if (invalid) throw new Error(invalid);
    if (
      get().bindings.some(
        (item) =>
          item.action !== action &&
          item.keys.toLowerCase() === keys.toLowerCase(),
      )
    )
      throw new Error("该快捷键已分配给其他功能。");
    const bindings = get().bindings.map((item) =>
      item.action === action ? { ...item, keys } : item,
    );
    saveShortcuts(bindings);
    set({ bindings });
  },
  reset: () => {
    const bindings = defaultShortcuts.map((item) => ({ ...item }));
    saveShortcuts(bindings);
    set({ bindings });
  },
}));
