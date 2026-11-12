import { StyledSelect } from '../../shared/components/StyledSelect';
import type { EffectName, LayerEffects } from "./types";
import { StyleColor, StyleNumber } from "./controls";

export function EffectFields({
  name,
  effects,
  change,
}: {
  name: EffectName;
  effects: LayerEffects;
  change: (effects: LayerEffects) => void;
}) {
  const effect = effects[name];
  const patch = (value: Partial<typeof effect>) =>
    change({ ...effects, [name]: { ...effect, ...value } });
  return (
    <div className="style-fields">
      <StyleColor
        label="效果颜色"
        value={effect.color}
        change={(color) => patch({ color })}
      />
      <StyleNumber
        label="效果不透明度"
        value={effect.opacity * 100}
        max={100}
        change={(opacity) => patch({ opacity: opacity / 100 })}
      />
      {name === "gradientOverlay" && (
        <>
          <StyleColor
            label="结束颜色"
            value={effects.gradientOverlay.endColor}
            change={(endColor) =>
              patch({ endColor } as Partial<LayerEffects["gradientOverlay"]>)
            }
          />
          <label>
            渐变类型
            <StyledSelect
              aria-label="渐变类型"
              value={effects.gradientOverlay.type ?? "linear"}
              onChange={(event) =>
                change({
                  ...effects,
                  gradientOverlay: {
                    ...effects.gradientOverlay,
                    type: event.target.value as "linear" | "radial",
                  },
                })
              }
            >
              <option value="linear">线性</option>
              <option value="radial">径向</option>
            </StyledSelect>
          </label>
          <StyleNumber
            label="渐变角度"
            value={effects.gradientOverlay.angle}
            max={360}
            change={(angle) =>
              patch({ angle } as Partial<LayerEffects["gradientOverlay"]>)
            }
          />
        </>
      )}
      {name === "stroke" && (
        <>
          <StyleNumber
            label="描边粗细"
            value={effects.stroke.spread}
            max={64}
            change={(spread) =>
              patch({ spread } as Partial<LayerEffects["stroke"]>)
            }
          />
          <label>
            描边位置
            <StyledSelect
              aria-label="描边位置"
              value={effects.stroke.position ?? "outside"}
              onChange={(event) =>
                change({
                  ...effects,
                  stroke: {
                    ...effects.stroke,
                    position: event.target.value as
                      "outside" | "center" | "inside",
                  },
                })
              }
            >
              <option value="outside">外部</option>
              <option value="center">居中</option>
              <option value="inside">内部</option>
            </StyledSelect>
          </label>
        </>
      )}
      {"blur" in effect && (
        <StyleNumber
          label="模糊大小"
          value={effect.blur}
          max={128}
          change={(blur) => patch({ blur } as Partial<typeof effect>)}
        />
      )}
      {"spread" in effect && name !== "stroke" && (
        <StyleNumber
          label="扩展大小"
          value={effect.spread}
          max={64}
          change={(spread) => patch({ spread } as Partial<typeof effect>)}
        />
      )}
      {(name === "dropShadow" || name === "innerShadow") && (
        <>
          <StyleNumber
            label="阴影距离"
            value={effects[name].distance}
            min={-256}
            max={256}
            change={(distance) => patch({ distance } as Partial<typeof effect>)}
          />
          <StyleNumber
            label="阴影角度"
            value={effects[name].angle}
            max={360}
            change={(angle) => patch({ angle } as Partial<typeof effect>)}
          />
        </>
      )}
    </div>
  );
}
