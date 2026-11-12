import type { TextGradient, TextStroke } from "../../shared/types";
import "../text-editor.css";

export const defaultStroke: TextStroke = {
  enabled: false,
  color: "#ffffff",
  width: 2,
};
export const defaultGradient: TextGradient = {
  enabled: false,
  startColor: "#ffcf40",
  endColor: "#ff4c73",
  angle: 90,
};

export function TextEffectControls({
  color,
  setColor,
  stroke,
  setStroke,
  gradient,
  setGradient,
}: {
  color: string;
  setColor: (color: string) => void;
  stroke: TextStroke;
  setStroke: (stroke: TextStroke) => void;
  gradient: TextGradient;
  setGradient: (gradient: TextGradient) => void;
}) {
  return (
    <div className="text-effects">
      <div className="text-fill-mode" role="group" aria-label="文字填充">
        <button
          type="button"
          aria-pressed={!gradient.enabled}
          onClick={() => setGradient({ ...gradient, enabled: false })}
        >
          纯色
        </button>
        <button
          type="button"
          aria-pressed={gradient.enabled}
          onClick={() => setGradient({ ...gradient, enabled: true })}
        >
          渐变
        </button>
      </div>
      {gradient.enabled ? (
        <>
          <div className="text-effects-grid">
            <label>
              起始颜色
              <input
                aria-label="渐变起始颜色"
                type="color"
                value={gradient.startColor}
                onChange={(event) =>
                  setGradient({ ...gradient, startColor: event.target.value })
                }
              />
            </label>
            <label>
              结束颜色
              <input
                aria-label="渐变结束颜色"
                type="color"
                value={gradient.endColor}
                onChange={(event) =>
                  setGradient({ ...gradient, endColor: event.target.value })
                }
              />
            </label>
          </div>
          <label>
            渐变方向（°）
            <div className="text-effect-stepper">
              <input
                aria-label="渐变方向"
                type="range"
                min={0}
                max={360}
                step={1}
                value={gradient.angle}
                onChange={(event) =>
                  setGradient({
                    ...gradient,
                    angle: Number(event.target.value),
                  })
                }
              />
              <input
                aria-label="渐变角度"
                type="number"
                min={0}
                max={360}
                step={1}
                value={gradient.angle}
                onChange={(event) =>
                  setGradient({
                    ...gradient,
                    angle: Number(event.target.value),
                  })
                }
              />
            </div>
          </label>
        </>
      ) : (
        <label>
          文字颜色
          <input
            aria-label="文字颜色"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
      )}
      <label className="text-stroke-toggle">
        <input
          aria-label="启用描边"
          type="checkbox"
          checked={stroke.enabled}
          onChange={(event) =>
            setStroke({ ...stroke, enabled: event.target.checked })
          }
        />
        描边
      </label>
      {stroke.enabled && (
        <div className="text-effects-grid">
          <label>
            描边颜色
            <input
              aria-label="描边颜色"
              type="color"
              value={stroke.color}
              onChange={(event) =>
                setStroke({ ...stroke, color: event.target.value })
              }
            />
          </label>
          <label>
            粗细（px）
            <input
              aria-label="描边粗细"
              type="number"
              min={0}
              max={32}
              step={0.5}
              value={stroke.width}
              onChange={(event) =>
                setStroke({ ...stroke, width: Number(event.target.value) })
              }
            />
          </label>
        </div>
      )}
    </div>
  );
}
