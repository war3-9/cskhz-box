import { beforeEach, expect, it, vi } from "vitest";
import { defaultShortcuts, formatShortcut, loadShortcuts, shortcutMatches } from "./shortcutConfig";
import { useShortcutSettings } from "./shortcutStore";
const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  useShortcutSettings.setState({ bindings: defaultShortcuts.map((item) => ({ ...item })) });
});
it("updates and persists shortcuts, rejects conflict, and resets", () => {
  const state = useShortcutSettings.getState();
  state.update("undo", "Ctrl+U");
  expect(loadShortcuts().find((item) => item.action === "undo")?.keys).toBe("Ctrl+U");
  expect(() => state.update("redo", "Ctrl+U")).toThrow("已分配");
  expect(() => state.update("undo", "Alt+F4")).toThrow("关闭窗口");
  expect(() => state.update("undo", "Escape")).toThrow("保留");
  state.reset();
  expect(loadShortcuts()).toEqual(defaultShortcuts);
});
it("matches exact modifiers and preserves both redo defaults", () => {
  const event = { key: "z", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true } as KeyboardEvent;
  expect(shortcutMatches(event, "Ctrl+Z")).toBe(false);
  expect(shortcutMatches(event, "Ctrl+Shift+Z")).toBe(true);
  expect(formatShortcut({ ...event, key: "Control" })).toBe("");
  expect(formatShortcut({ ...event, key: "u", shiftKey: false })).toBe("Ctrl+U");
  expect(defaultShortcuts.filter((item) => item.action.startsWith("redo"))).toHaveLength(2);
});
