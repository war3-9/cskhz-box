import type { ImageLayer } from "../../../shared/types";
import { normalizeEffects } from "../../effects";
import { alphaMask, paintMask, surface } from "./canvas";
import { effectMasks } from "./masks";

export interface PreparedLayer {
  image: CanvasImageSource;
  x: number;
  y: number;
  width: number;
  height: number;
}
const cache = new WeakMap<object, { key: string; result: PreparedLayer }>();
export function prepareLayer(
  image: HTMLImageElement,
  layer: ImageLayer,
): PreparedLayer {
  const effects = normalizeEffects(layer.effects);
  if (!Object.values(effects).some((effect) => effect.enabled))
    return { image, x: 0, y: 0, width: layer.width, height: layer.height };
  const key = JSON.stringify([layer.width, layer.height, effects]);
  const cached = cache.get(image);
  if (cached?.key === key) return cached.result;
  const extents = [effects.stroke.enabled ? effects.stroke.spread : 0];
  for (const effect of [
    effects.dropShadow,
    effects.innerShadow,
    effects.innerGlow,
  ])
    if (effect.enabled)
      extents.push(effect.spread + effect.blur * 3 + Math.abs(effect.distance));
  if (effects.outerGlow.enabled)
    extents.push(effects.outerGlow.spread + effects.outerGlow.blur * 3);
  const padding = Math.ceil(Math.max(...extents)) + 2;
  // Bound raster work for very large imported layers; geometry stays in document pixels.
  const scale = Math.min(
    1,
    4096 / (layer.width + padding * 2),
    4096 / (layer.height + padding * 2),
  );
  const pad = Math.ceil(padding * scale);
  const width = Math.max(1, Math.ceil(layer.width * scale));
  const height = Math.max(1, Math.ceil(layer.height * scale));
  const source = surface(width + pad * 2, height + pad * 2);
  const ctx = source.getContext("2d")!;
  ctx.drawImage(image, pad, pad, width, height);
  const masks = effectMasks(alphaMask(source), source.width, source.height);
  const result = surface(source.width, source.height);
  const output = result.getContext("2d")!;
  for (const [effect, distance, angle] of [
    [
      effects.dropShadow,
      effects.dropShadow.distance * scale,
      (effects.dropShadow.angle * Math.PI) / 180,
    ],
    [effects.outerGlow, 0, 0],
  ] as const) {
    if (!effect.enabled || effect.opacity === 0) continue;
    const painted = paintMask(
      masks.spread(effect.spread * scale),
      effect.color,
      effect.blur * scale,
      effect.opacity,
    );
    output.drawImage(
      painted,
      Math.cos(angle) * distance,
      Math.sin(angle) * distance,
    );
  }
  // Overlays affect this layer's alpha only, never previously composited layers.
  for (const [effect, gradientEffect] of [
    [effects.colorOverlay, null],
    [effects.gradientOverlay, effects.gradientOverlay],
  ] as const) {
    if (!effect.enabled) continue;
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = effect.opacity;
    if (gradientEffect) {
      const cx = pad + width / 2,
        cy = pad + height / 2;
      const radians = (gradientEffect.angle * Math.PI) / 180;
      const dx = Math.cos(radians),
        dy = Math.sin(radians);
      const half = (Math.abs(dx) * width + Math.abs(dy) * height) / 2;
      const gradient =
        gradientEffect.type === "radial"
          ? ctx.createRadialGradient(
              cx,
              cy,
              0,
              cx,
              cy,
              Math.max(width, height) / 2,
            )
          : ctx.createLinearGradient(
              cx - dx * half,
              cy - dy * half,
              cx + dx * half,
              cy + dy * half,
            );
      gradient.addColorStop(0, effect.color);
      gradient.addColorStop(1, gradientEffect.endColor);
      ctx.fillStyle = gradient;
    } else ctx.fillStyle = effect.color;
    ctx.fillRect(0, 0, source.width, source.height);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  for (const effect of [effects.innerShadow, effects.innerGlow]) {
    if (!effect.enabled || !effect.opacity) continue;
    const painted = paintMask(
      masks.spread(effect.spread * scale, true),
      effect.color,
      effect.blur * scale,
      effect.opacity,
    );
    const clipped = surface(source.width, source.height);
    const inner = clipped.getContext("2d")!;
    const distance = effect === effects.innerGlow ? 0 : effect.distance * scale;
    const radians = (effect.angle * Math.PI) / 180;
    inner.drawImage(
      painted,
      Math.cos(radians) * distance,
      Math.sin(radians) * distance,
    );
    inner.globalCompositeOperation = "destination-in";
    inner.drawImage(source, 0, 0);
    ctx.drawImage(clipped, 0, 0);
  }
  output.drawImage(source, 0, 0);
  if (effects.stroke.enabled && effects.stroke.spread > 0) {
    const stroke = masks.stroke(
      effects.stroke.spread * scale,
      effects.stroke.position ?? "outside",
    );
    output.drawImage(
      paintMask(stroke, effects.stroke.color, 0, effects.stroke.opacity),
      0,
      0,
    );
  }
  const prepared = {
    image: result,
    x: -pad / scale,
    y: -pad / scale,
    width: result.width / scale,
    height: result.height / scale,
  };
  cache.set(image, { key, result: prepared });
  return prepared;
}
