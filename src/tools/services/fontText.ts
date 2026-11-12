import type { Asset, TextLayerData } from "../../shared/types";
import { gradientLine } from "../utils/gradient";

const loaded = new Map<string, Promise<FontFace>>();
async function loadFont(asset: Asset) {
  if (!asset.fontData) throw new Error("字体数据无法读取");
  if (!loaded.has(asset.id)) {
    const face = new FontFace(
      asset.id,
      `url(${asset.webFontData || asset.fontData})`,
    );
    loaded.set(
      asset.id,
      face.load().then((font) => {
        document.fonts.add(font);
        return font;
      }),
    );
  }
  return loaded.get(asset.id)!;
}

export async function renderFontText(
  asset: Asset,
  text: string,
  size: number,
  color: string,
  effects: Pick<TextLayerData, "stroke" | "gradient"> = {},
) {
  if (
    !Number.isInteger(size) ||
    size < 8 ||
    size > 256 ||
    !text.trim() ||
    text.length > 1000
  )
    throw new Error("文字或字号无效");
  const strokeWidth = effects.stroke?.enabled ? effects.stroke.width : 0;
  if (!Number.isFinite(strokeWidth) || strokeWidth < 0 || strokeWidth > 32)
    throw new Error("描边粗细应为 0–32 px");
  const colors = [
    color,
    effects.stroke?.color,
    effects.gradient?.startColor,
    effects.gradient?.endColor,
  ].filter((value): value is string => value !== undefined);
  if (colors.some((value) => !/^#[0-9a-f]{6}$/i.test(value)))
    throw new Error("文字颜色无效");
  if (
    effects.gradient &&
    (!Number.isFinite(effects.gradient.angle) ||
      effects.gradient.angle < 0 ||
      effects.gradient.angle > 360)
  )
    throw new Error("渐变方向应为 0–360°");
  await loadFont(asset);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = `${size}px "${asset.id}"`;
  const lines = text.split("\n");
  const measurements = lines.map((line) => context.measureText(line));
  const left = Math.ceil(
    Math.max(0, ...measurements.map((m) => m.actualBoundingBoxLeft)),
  );
  const right = Math.ceil(
    Math.max(
      size,
      ...measurements.map((m) => Math.max(m.width, m.actualBoundingBoxRight)),
    ),
  );
  const ascent = Math.ceil(
    Math.max(size, ...measurements.map((m) => m.actualBoundingBoxAscent)),
  );
  const descent = Math.ceil(
    Math.max(
      size * 0.3,
      ...measurements.map((m) => m.actualBoundingBoxDescent),
    ),
  );
  const step = Math.ceil(ascent + descent);
  const padding = 8 + Math.ceil(strokeWidth / 2);
  canvas.width = left + right + padding * 2;
  canvas.height = step * lines.length + padding * 2;
  if (
    canvas.width > 8192 ||
    canvas.height > 8192 ||
    canvas.width * canvas.height > 40_000_000
  )
    throw new Error("文字图片过大，请减少文字或字号");
  context.font = `${size}px "${asset.id}"`;
  if (strokeWidth > 0 && effects.stroke) {
    context.strokeStyle = effects.stroke.color;
    context.lineWidth = strokeWidth;
    context.lineJoin = "round";
    lines.forEach((line, index) =>
      context.strokeText(line, left + padding, ascent + padding + index * step),
    );
  }
  context.fillStyle = color;
  if (effects.gradient?.enabled) {
    const top =
      padding +
      Math.min(...measurements.map((m) => ascent - m.actualBoundingBoxAscent));
    const bottom =
      padding +
      Math.max(
        ...measurements.map(
          (m, index) => ascent + index * step + m.actualBoundingBoxDescent,
        ),
      );
    const line = gradientLine(
      left + right,
      Math.max(1, bottom - top),
      effects.gradient.angle,
    );
    const fill = context.createLinearGradient(
      line.x0 + padding,
      line.y0 + top,
      line.x1 + padding,
      line.y1 + top,
    );
    fill.addColorStop(0, effects.gradient.startColor);
    fill.addColorStop(1, effects.gradient.endColor);
    context.fillStyle = fill;
  }
  lines.forEach((line, index) =>
    context.fillText(line, left + padding, ascent + padding + index * step),
  );
  return {
    imagePath: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  };
}
