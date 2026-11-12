import type { LayerEffect, LayerEffects } from "../shared/types";
const defaultEffect = (): LayerEffect => ({ enabled: false, color: "#000000", opacity: 1, blur: 8, distance: 4, angle: 45, spread: 0 });
export const defaultEffects = (): LayerEffects => ({
  innerShadow: defaultEffect(), innerGlow: defaultEffect(), colorOverlay: { enabled: false, color: "#000000", opacity: 1 },
  gradientOverlay: { enabled: false, opacity: 1, angle: 90, color: "#ffffff", endColor: "#000000", type: "linear" },
  stroke: { enabled: false, color: "#ffffff", opacity: 1, spread: 2, position: "outside" },
  outerGlow: { enabled: false, color: "#ffffff", opacity: 1, blur: 12, spread: 0 }, dropShadow: defaultEffect(),
});
export function normalizeEffects(effects?: Partial<LayerEffects>): LayerEffects {
  const base = defaultEffects();
  return Object.fromEntries(Object.keys(base).map((key) => [key, { ...base[key as keyof LayerEffects], ...(effects?.[key as keyof LayerEffects] ?? {}) }])) as unknown as LayerEffects;
}
