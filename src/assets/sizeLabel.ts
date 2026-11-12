import type { Asset } from "../shared/types";

export function sizeLabel(asset: Pick<Asset, "width" | "height" | "kind">) {
  if (asset.kind === "font") return null;
  if (asset.width < 128 && asset.height < 128) return "游戏";
  if (asset.width >= 300 && asset.height >= 300) return "商城";
  return null;
}
