import { isTauri, invoke } from "@tauri-apps/api/core";
import type { Library } from "../../shared/types";
import { renderFontText } from "../../tools/services/fontText";
import type { ProjectTemplate } from "../../project/templates";

export interface BuiltinLibrary extends Library {
  templates?: ProjectTemplate[];
  legacyImages?: Record<string, string>;
}
let builtin: BuiltinLibrary = { categories: [], assets: [] };
export const getBuiltinLibrary = () => builtin;

export async function loadBuiltinLibrary(): Promise<BuiltinLibrary> {
  if (isTauri()) builtin = await invoke<BuiltinLibrary>("load_builtin_library");
  else if (import.meta.env.DEV) {
    const response = await fetch("/__builtin-library", { cache: "no-store" });
    if (!response.ok) throw new Error("内置素材包无法加载");
    builtin = await response.json();
  } else throw new Error("请使用桌面程序加载内置素材");
  await Promise.all(
    builtin.assets
      .filter((asset) => asset.kind === "font")
      .map(async (asset) => {
        try {
          const preview = await renderFontText(
            asset,
            asset.name,
            48,
            "#2658a5",
          );
          asset.imagePath = preview.imagePath;
          asset.thumbnailPath = preview.imagePath;
        } catch {
          // A font failure must not prevent the image library from opening.
        }
      }),
  );
  return builtin;
}
