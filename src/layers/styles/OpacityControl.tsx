import { useEffect, useState } from "react";
import type { ImageLayer } from "../../shared/types";
import { useEditor } from "../store";
import { useLayerDraft } from "./draftStore";

export function OpacityControl({ layer }: { layer: ImageLayer }) {
  const [value, setValue] = useState(layer.opacity);
  useEffect(() => {
    setValue(layer.opacity);
    return () => {
      if (useLayerDraft.getState().original === layer)
        useLayerDraft.getState().clear();
    };
  }, [layer]);
  const preview = (next: number) => {
    if (!Number.isFinite(next)) return;
    const opacity = Math.max(0, Math.min(1, next));
    setValue(opacity);
    useLayerDraft.getState().preview(layer, { opacity });
  };
  const commit = (next: number) => {
    useLayerDraft.getState().clear();
    const current = useEditor
      .getState()
      .document.layers.find((item) => item.id === layer.id);
    if (current === layer && Number.isFinite(next))
      useEditor
        .getState()
        .updateLayer(layer.id, { opacity: Math.max(0, Math.min(1, next)) });
  };
  return (
    <div className="layer-opacity-control">
      <label htmlFor={`opacity-${layer.id}`}>不透明度</label>
      <span>
        <input
          aria-label="不透明度百分比"
          type="number"
          min={0}
          max={100}
          step={1}
          value={Math.round(value * 100)}
          disabled={layer.locked}
          onChange={(event) => preview(Number(event.target.value) / 100)}
          onBlur={(event) => commit(Number(event.target.value) / 100)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        %
      </span>
      <input
        id={`opacity-${layer.id}`}
        aria-label="透明度"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={layer.locked}
        onChange={(event) => preview(Number(event.target.value))}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        onKeyUp={(event) => commit(Number(event.currentTarget.value))}
        onBlur={(event) => commit(Number(event.currentTarget.value))}
        onPointerCancel={() => {
          setValue(layer.opacity);
          useLayerDraft.getState().clear();
        }}
      />
    </div>
  );
}
