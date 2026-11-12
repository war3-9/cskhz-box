import { useState } from "react";
import { formatShortcut, type ShortcutBinding } from "./shortcutConfig";
import { useShortcutSettings } from "./shortcutStore";

export function ShortcutSettings() {
  const { bindings: shortcuts, update, reset } = useShortcutSettings();
  const [error, setError] = useState("");
  const [recording, setRecording] = useState<string | null>(null);
  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <div>
          <h3>快捷键</h3>
        </div>
        <button
          className="secondary"
          onClick={() => {
            reset();
            setError("");
            setRecording(null);
          }}
        >
          恢复默认
        </button>
      </div>
      <div className="shortcut-list">
        {shortcuts.map((item: ShortcutBinding) => (
          <label className="shortcut-row" key={item.action}>
            <span>{item.label}</span>
            <input
              aria-label={item.label}
              value={recording === item.action ? "请按下快捷键" : item.keys}
              readOnly
              onFocus={() => setRecording(item.action)}
              onBlur={() => setRecording(null)}
              onKeyDown={(event) => {
                if (event.key === "Tab" || event.key === "Escape") {
                  setRecording(null);
                  return;
                }
                if (event.nativeEvent.isComposing) return;
                event.preventDefault();
                const next = formatShortcut(event);
                if (!next) return;
                try {
                  update(item.action, next);
                  setRecording(null);
                  setError("");
                  event.currentTarget.blur();
                } catch (cause) {
                  setError(
                    String(cause instanceof Error ? cause.message : cause),
                  );
                }
              }}
            />
          </label>
        ))}
      </div>
      <div className="shortcut-row shortcut-fixed">
        <span>取消操作</span>
        <kbd>Esc</kbd>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
