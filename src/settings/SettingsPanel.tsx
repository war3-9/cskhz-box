import { Modal } from "../shared/components/Modal";
import "./settings.css";
import { useState } from "react";
import { Keyboard, Sparkles } from "lucide-react";
import { ShortcutSettings } from "./ShortcutSettings";
import { AiSettings } from "./AiSettings";

export function SettingsPanel({ close }: { close: () => void }) {
  const [active, setActive] = useState<"shortcuts" | "ai">("shortcuts");
  return (
    <Modal title="设置" close={close} className="settings-panel">
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置导航">
          <button
            className={active === "shortcuts" ? "active" : ""}
            onClick={() => setActive("shortcuts")}
          >
            <Keyboard size={17} />
            快捷键
          </button>
          <button
            className={active === "ai" ? "active" : ""}
            onClick={() => setActive("ai")}
          >
            <Sparkles size={17} />
            AI 对接
          </button>
        </nav>
        <div className="settings-content">
          {active === "shortcuts" ? <ShortcutSettings /> : <AiSettings />}
        </div>
      </div>
    </Modal>
  );
}
