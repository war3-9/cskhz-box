import { useRef, useState } from "react";
import { FolderOpen, Save } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { applyProject, openDesktopProject, saveProject } from "./files";
import { useUi } from "../app/uiStore";
import { useTasks } from "../tasks/store";
export function ProjectToolbar() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const activeId = useTasks((state) => state.activeId);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      useUi.getState().notify(String(error), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        className="text-button"
        disabled={busy}
        onClick={() =>
          isTauri() ? run(openDesktopProject) : input.current?.click()
        }
      >
        <FolderOpen size={16} />
        打开
      </button>
      <button
        className="text-button"
        disabled={busy || !activeId}
        onClick={() =>
          run(async () => {
            if (await saveProject()) useUi.getState().notify("工程已保存");
          })
        }
      >
        <Save size={16} />
        保存
      </button>
      <input
        hidden
        ref={input}
        type="file"
        accept=".layerforge,.json"
        aria-label="打开工程文件"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          run(async () => {
            if (file.size > 200 * 1024 * 1024)
              throw new Error("工程文件不能超过 200 MB。");
            applyProject(await file.text());
          });
        }}
      />
    </>
  );
}
