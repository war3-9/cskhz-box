import type { Asset } from "../../shared/types";
import { sizeLabel } from "../sizeLabel";

export function AssetDimensions({ asset }: { asset: Asset }) {
  if (asset.kind === "font") return null;
  const label = sizeLabel(asset);
  return (
    <div className="asset-dimensions">
      <span>
        {asset.width} × {asset.height} px
      </span>
      {label && (
        <span
          className={`asset-size-label ${label === "游戏" ? "game" : "shop"}`}
        >
          {label}
        </span>
      )}
    </div>
  );
}
