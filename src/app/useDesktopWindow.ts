import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useUi } from "./uiStore";

export function useDesktopWindow() {
  const desktop = isTauri();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!desktop) return;
    const window = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const refresh = async () => {
      const value = await window.isMaximized();
      if (!disposed) setMaximized(value);
    };
    const report = (error: unknown) => {
      if (!disposed) useUi.getState().notify(String(error), "error");
    };
    window
      .onResized(() => void refresh().catch(report))
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(report);
    void refresh().catch(report);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop]);

  const run = async (
    action: "minimize" | "toggleMaximize" | "close" | "startDragging",
  ) => {
    if (!desktop) return;
    try {
      await getCurrentWindow()[action]();
    } catch (error) {
      useUi.getState().notify(String(error), "error");
    }
  };
  return { desktop, maximized, run };
}
