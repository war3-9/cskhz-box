import { SlidersHorizontal, Type } from "lucide-react";
import {
  effectLabels,
  effectOrder,
  type EffectName,
  type LayerEffects,
} from "./types";

export type StyleTab = EffectName | "basic" | "text";
export function StyleNavigation({
  tab,
  select,
  effects,
  change,
  locked,
  text,
}: {
  tab: StyleTab;
  select: (tab: StyleTab) => void;
  effects: LayerEffects;
  change: (effects: LayerEffects) => void;
  locked: boolean;
  text: boolean;
}) {
  return (
    <nav className="style-navigation" aria-label="图层编辑分类">
      <button
        type="button"
        className={tab === "basic" ? "active" : ""}
        onClick={() => select("basic")}
      >
        <SlidersHorizontal size={15} />
        基础属性
      </button>
      {text && (
        <button
          type="button"
          className={tab === "text" ? "active" : ""}
          onClick={() => select("text")}
        >
          <Type size={15} />
          文字
        </button>
      )}
      <span className="style-navigation-label">图层样式</span>
      {effectOrder.map((name) => (
        <div
          key={name}
          className={`style-nav-effect ${tab === name ? "active" : ""}`}
        >
          <input
            aria-label={`启用${effectLabels[name]}`}
            type="checkbox"
            checked={effects[name].enabled}
            disabled={locked}
            onChange={(event) => {
              change({
                ...effects,
                [name]: { ...effects[name], enabled: event.target.checked },
              });
              select(name);
            }}
          />
          <button type="button" onClick={() => select(name)}>
            {effectLabels[name]}
          </button>
        </div>
      ))}
    </nav>
  );
}
