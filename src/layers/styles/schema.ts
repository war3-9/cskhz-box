import { z } from "zod";
import { blendModes } from "./types";
import { normalizeEffects } from "../effects";

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const opacity = z.number().finite().min(0).max(1);
const angle = z.number().finite().min(0).max(360);
const spread = z.number().finite().min(0).max(100);
const blur = z.number().finite().min(0).max(256);
const basic = z.object({ enabled: z.boolean(), color, opacity });
const shadow = basic.extend({
  blur,
  spread,
  distance: z.number().finite().min(-256).max(256),
  angle,
});
export const blendModeSchema = z.enum(blendModes);
export const layerEffectsSchema = z
  .object({
    stroke: basic.extend({
      spread,
      position: z.enum(["outside", "center", "inside"]).optional(),
    }),
    colorOverlay: basic,
    gradientOverlay: z.object({
      enabled: z.boolean(),
      opacity,
      angle,
      color,
      endColor: color,
      type: z.enum(["linear", "radial"]).optional(),
    }),
    dropShadow: shadow,
    outerGlow: basic.extend({ blur, spread }),
    innerShadow: shadow,
    innerGlow: shadow,
  })
  .partial()
  .transform(normalizeEffects);
