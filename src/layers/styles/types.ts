export const blendModes = [
  "source-over",
  "multiply",
  "screen",
  "overlay",
] as const;
export type BlendMode = (typeof blendModes)[number];
export const blendLabels: Record<BlendMode, string> = {
  "source-over": "正常",
  multiply: "正片叠底",
  screen: "滤色",
  overlay: "叠加",
};
export interface LayerEffect {
  enabled: boolean;
  color: string;
  opacity: number;
  blur: number;
  distance: number;
  angle: number;
  spread: number;
}
export interface LayerEffects {
  innerShadow: LayerEffect;
  innerGlow: LayerEffect;
  colorOverlay: Pick<LayerEffect, "enabled" | "color" | "opacity">;
  gradientOverlay: Pick<LayerEffect, "enabled" | "opacity" | "angle"> & {
    color: string;
    endColor: string;
    type?: "linear" | "radial";
  };
  stroke: Pick<LayerEffect, "enabled" | "color" | "opacity" | "spread"> & {
    position?: "outside" | "center" | "inside";
  };
  outerGlow: Pick<
    LayerEffect,
    "enabled" | "color" | "opacity" | "blur" | "spread"
  >;
  dropShadow: LayerEffect;
}
export type EffectName = keyof LayerEffects;
export const effectLabels: Record<EffectName, string> = {
  stroke: "描边",
  colorOverlay: "颜色叠加",
  gradientOverlay: "渐变叠加",
  dropShadow: "投影",
  outerGlow: "外发光",
  innerShadow: "内阴影",
  innerGlow: "内发光",
};
export const effectOrder = Object.keys(effectLabels) as EffectName[];
