export type ShortcutAction =
  "undo" | "redo" | "redoAlt" | "duplicate" | "paste" | "fixLayer" | "delete";

export interface ShortcutBinding {
  action: ShortcutAction;
  label: string;
  keys: string;
}

export const defaultShortcuts: ShortcutBinding[] = [
  { action: "undo", label: "撤销", keys: "Ctrl+Z" },
  { action: "redo", label: "重做", keys: "Ctrl+Shift+Z" },
  { action: "redoAlt", label: "重做（备用）", keys: "Ctrl+Y" },
  { action: "duplicate", label: "复制图层", keys: "Ctrl+C" },
  { action: "paste", label: "粘贴图层", keys: "Ctrl+V" },
  { action: "fixLayer", label: "固定图层", keys: "Ctrl+T" },
  { action: "delete", label: "删除图层", keys: "Delete" },
];

const storageKey = "layerforge-shortcuts";

export function loadShortcuts(): ShortcutBinding[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (!Array.isArray(parsed))
      return defaultShortcuts.map((item) => ({ ...item }));
    const loaded = defaultShortcuts.map((defaultItem) => {
      const saved = parsed.find((item) => item?.action === defaultItem.action);
      return saved && typeof saved.keys === "string" && !shortcutError(saved.keys)
        ? { ...defaultItem, keys: saved.keys }
        : { ...defaultItem };
    });
    return new Set(loaded.map((item) => item.keys.toLowerCase())).size === loaded.length
      ? loaded : defaultShortcuts.map((item) => ({ ...item }));
  } catch {
    return defaultShortcuts.map((item) => ({ ...item }));
  }
}

export function saveShortcuts(shortcuts: ShortcutBinding[]) {
  localStorage.setItem(storageKey, JSON.stringify(shortcuts));
}

export function shortcutError(keys: string) {
  const parts = keys.split("+");
  const key = parts.at(-1) ?? "";
  if (!key || ["Escape", "Tab", "Enter", "Unidentified", "Process", "Dead"].includes(key))
    return "该按键保留用于窗口或输入操作。";
  if (key === "F4" && parts.includes("Alt")) return "Alt+F4 保留用于关闭窗口。";
  if (!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Delete|Backspace|Space|Arrow(?:Up|Down|Left|Right))$/i.test(key))
    return "请选择字母、数字、功能键或删除键。";
  if (parts.slice(0, -1).some((part) => !["Ctrl", "Alt", "Shift"].includes(part)))
    return "快捷键组合无效。";
  return "";
}

export function formatShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
  >,
) {
  const modifiers = [
    event.ctrlKey || event.metaKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
  ].filter(Boolean);
  const key = event.key === " " ? "Space" : event.key;
  if (["Control", "Alt", "Shift", "Meta"].includes(key)) return "";
  return [...modifiers, key.length === 1 ? key.toUpperCase() : key].join("+");
}

export function shortcutMatches(event: KeyboardEvent, binding: string) {
  const expected = binding.toLowerCase().split("+");
  const key = event.key === " " ? "space" : event.key.toLowerCase();
  const modifiers = new Set([
    event.ctrlKey || event.metaKey ? "ctrl" : "",
    event.altKey ? "alt" : "",
    event.shiftKey ? "shift" : "",
  ]);
  return (
    expected.includes(key) &&
    expected
      .filter((item) => ["ctrl", "alt", "shift"].includes(item))
      .every((item) => modifiers.has(item)) &&
    expected.filter((item) => ["ctrl", "alt", "shift"].includes(item))
      .length === [...modifiers].filter(Boolean).length
  );
}
