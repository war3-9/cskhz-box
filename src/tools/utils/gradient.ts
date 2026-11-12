// Project the glyph bounds onto the direction so both end colors stay visible.
export function gradientLine(width: number, height: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const halfLength = (Math.abs(dx) * width + Math.abs(dy) * height) / 2;
  return {
    x0: width / 2 - dx * halfLength,
    y0: height / 2 - dy * halfLength,
    x1: width / 2 + dx * halfLength,
    y1: height / 2 + dy * halfLength,
  };
}
