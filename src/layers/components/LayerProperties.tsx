import { StyledSelect } from '../../shared/components/StyledSelect';
import { useState } from "react";
import type { ImageLayer } from "../../shared/types";
import { useEditor } from "../store";
import { OpacityControl } from "../styles/OpacityControl";
import { blendModes, blendLabels, type BlendMode } from "../styles/types";
import {
  Link,
  Unlink,
  FlipHorizontal2,
  FlipVertical2,
  SlidersHorizontal,
} from "lucide-react";
import { IconButton } from "../../shared/components/IconButton";
function Numeric({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  disabled: boolean;
}) {
  return (
    <label className="numeric-field">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        value={Math.round(value * 10) / 10}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const value = Number(e.target.value);
          if (
            Number.isFinite(value) &&
            value >= (min ?? -Infinity) &&
            value <= (max ?? Infinity)
          )
            onChange(value);
        }}
      />
    </label>
  );
}
export function LayerProperties({
  layer,
  edit,
}: {
  layer?: ImageLayer;
  edit: () => void;
}) {
  const update = useEditor((s) => s.updateLayer);
  const [linked, setLinked] = useState(true);
  if (!layer)
    return (
      <div className="properties property-empty">
        <span>图层属性</span>
        <small>未选择图层</small>
      </div>
    );
  return (
    <div className="properties">
      <div className="properties-heading">
        <span>图层属性</span>
        <small>
          {layer.locked
            ? "已锁定"
            : layer.kind === "base"
              ? "底图"
              : layer.text
                ? "文字"
                : "图片"}
        </small>
      </div>
      <OpacityControl key={layer.id} layer={layer} />
      <label className="layer-blend-control">
        混合模式
        <StyledSelect
          aria-label="图层混合模式"
          value={layer.blendMode ?? "source-over"}
          disabled={layer.locked}
          onChange={(event) =>
            update(layer.id, { blendMode: event.target.value as BlendMode })
          }
        >
          {blendModes.map((mode) => (
            <option key={mode} value={mode}>
              {blendLabels[mode]}
            </option>
          ))}
        </StyledSelect>
      </label>
      <div className="property-grid">
        <Numeric
          label="X"
          value={layer.x}
          disabled={layer.locked}
          onChange={(x) => update(layer.id, { x })}
        />
        <Numeric
          label="Y"
          value={layer.y}
          disabled={layer.locked}
          onChange={(y) => update(layer.id, { y })}
        />
        <Numeric
          label="宽度"
          min={8}
          max={
            linked
              ? Math.min(40000, (40000 * layer.width) / layer.height)
              : 40000
          }
          value={layer.width}
          disabled={layer.locked}
          onChange={(width) =>
            update(layer.id, {
              width,
              ...(linked
                ? { height: (width * layer.height) / layer.width }
                : {}),
            })
          }
        />
        <Numeric
          label="高度"
          min={8}
          max={
            linked
              ? Math.min(40000, (40000 * layer.height) / layer.width)
              : 40000
          }
          value={layer.height}
          disabled={layer.locked}
          onChange={(height) =>
            update(layer.id, {
              height,
              ...(linked
                ? { width: (height * layer.width) / layer.height }
                : {}),
            })
          }
        />
        <Numeric
          label="旋转"
          min={-360}
          max={360}
          value={layer.rotation}
          disabled={layer.locked}
          onChange={(rotation) => update(layer.id, { rotation })}
        />
      </div>
      <div className="layer-property-actions">
        <IconButton
          label="锁定宽高比"
          aria-pressed={linked}
          onClick={() => setLinked(!linked)}
        >
          {linked ? <Link size={14} /> : <Unlink size={14} />}
        </IconButton>
        <IconButton
          label="水平翻转"
          disabled={layer.locked}
          onClick={() => update(layer.id, { flipX: !layer.flipX })}
        >
          <FlipHorizontal2 size={14} />
        </IconButton>
        <IconButton
          label="垂直翻转"
          disabled={layer.locked}
          onClick={() => update(layer.id, { flipY: !layer.flipY })}
        >
          <FlipVertical2 size={14} />
        </IconButton>
        <button type="button" className="layer-style-command" onClick={edit}>
          <SlidersHorizontal size={14} />
          编辑图层
        </button>
      </div>
    </div>
  );
}
