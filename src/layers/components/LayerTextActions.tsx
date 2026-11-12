import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { ImageLayer } from "../../shared/types";
import { useLibrary } from "../../assets/store";
import { useEditor } from "../store";
import { IconButton } from "../../shared/components/IconButton";
import { FontTextDialog } from "../../tools/components/FontTextDialog";
import { textFont } from "../../tools/services/textLayers";

export function LayerTextActions({
  layer,
  properties = false,
  editSignal = 0,
}: {
  layer: ImageLayer;
  properties?: boolean;
  editSignal?: number;
}) {
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (editSignal) setEditing(true); }, [editSignal]);
  const fonts = useLibrary((state) => state.library.assets);
  const font = textFont(
    layer,
    fonts.filter((asset) => asset.kind === "font"),
  );
  if (!font) return null;
  return (
    <div
      className={properties ? "text-layer-actions" : "text-layer-row-actions"}
    >
      <IconButton
        label={properties ? "编辑文字" : `编辑文字${layer.name}`}
        disabled={layer.locked}
        onClick={() => setEditing(true)}
      >
        <Pencil size={14} />
      </IconButton>
      <IconButton
        label={properties ? "删除文字" : `删除文字${layer.name}`}
        disabled={layer.locked}
        onClick={() => useEditor.getState().deleteLayer(layer.id)}
      >
        <Trash2 size={14} />
      </IconButton>
      {editing && (
        <FontTextDialog
          font={font}
          layer={layer}
          close={() => setEditing(false)}
        />
      )}
    </div>
  );
}
