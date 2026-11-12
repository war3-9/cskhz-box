import { useState } from "react";
import type { Asset } from "../../shared/types";
import { useEditor } from "../../layers/store";
import { FontTextDialog } from "../../tools/components/FontTextDialog";
import { requireCanvas } from "../../canvas/requireCanvas";
import { isTauri } from '@tauri-apps/api/core';
import { beginAssetDrag, endAssetDrag, useAssetDrag } from '../pointerDrag';

export const ASSET_MIME = "application/x-layerforge-asset";
export function AssetPreview({ asset }: { asset: Asset }) {
  const [editing, setEditing] = useState(false);
  const actionable = asset.kind === "font" || asset.groupId === "backgrounds";
  const activate = () => {
    if (actionable && !requireCanvas()) return;
    if (asset.kind === "font") setEditing(true);
    else if (asset.groupId === "backgrounds")
      useEditor.getState().setBase(asset);
  };
  return (
    <>
      <div
        className={`asset-preview ${actionable ? "asset-preview-action" : ""}`}
        role={actionable ? "button" : undefined}
        tabIndex={actionable ? 0 : undefined}
        draggable={!actionable && !isTauri()}
        onPointerDown={event => { if (isTauri() && !actionable && event.button === 0 && requireCanvas()) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); beginAssetDrag(asset.id, event.clientX, event.clientY); } }}
        onPointerMove={event => { if (useAssetDrag.getState().assetId === asset.id) useAssetDrag.setState({ x: event.clientX, y: event.clientY }); }}
        onPointerUp={event => { if (useAssetDrag.getState().assetId === asset.id) { window.dispatchEvent(new CustomEvent('box-asset-drop', { detail: { assetId: asset.id, x: event.clientX, y: event.clientY } })); endAssetDrag(); } }}
        onPointerCancel={endAssetDrag}
        data-asset-id={asset.id}
        aria-label={asset.name}
        onClick={activate}
        onKeyDown={(event) => {
          if (actionable && ["Enter", " "].includes(event.key)) {
            event.preventDefault();
            activate();
          }
        }}
        onDragStart={(event) => {
          if (!requireCanvas()) {
            event.preventDefault();
            return;
          }
          event.dataTransfer.setData(ASSET_MIME, asset.id);
          event.dataTransfer.effectAllowed = "copy";
        }}
      >
        <img src={asset.thumbnailPath} alt={asset.name} draggable={false} decoding="async" loading="lazy" />
      </div>
      {editing && (
        <FontTextDialog font={asset} close={() => setEditing(false)} />
      )}
    </>
  );
}
