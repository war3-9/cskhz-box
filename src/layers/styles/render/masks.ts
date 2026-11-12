import { distanceField } from "./distance";
import { maskFromAlpha } from "./canvas";

export function effectMasks(alpha: Uint8Array, width: number, height: number) {
  let outside: Float32Array | undefined;
  let inside: Float32Array | undefined;
  const outer = () => (outside ??= distanceField(alpha, width, height, true));
  const inner = () => (inside ??= distanceField(alpha, width, height, false));
  const create = (sample: (i: number) => number) =>
    maskFromAlpha(
      Uint8Array.from(alpha, (_, i) =>
        Math.round(Math.max(0, Math.min(255, sample(i)))),
      ),
      width,
      height,
    );
  return {
    spread: (radius: number, inverse = false) => {
      if (!radius) return create((i) => (inverse ? 255 - alpha[i] : alpha[i]));
      const field = inverse ? inner() : outer();
      return create((i) =>
        Math.max(
          inverse ? 255 - alpha[i] : alpha[i],
          Math.max(0, Math.min(1, radius + 1 - field[i])) * 255,
        ),
      );
    },
    stroke: (radius: number, position: "outside" | "center" | "inside") => {
      const outerRadius =
        position === "inside" ? 0 : position === "center" ? radius / 2 : radius;
      const innerRadius =
        position === "outside"
          ? 0
          : position === "center"
            ? radius / 2
            : radius;
      const outerField = outer(),
        innerField = inner();
      return create((i) =>
        alpha[i]
          ? Math.min(
              alpha[i],
              Math.max(0, Math.min(1, innerRadius + 1 - innerField[i])) * 255,
            )
          : Math.max(0, Math.min(1, outerRadius + 1 - outerField[i])) * 255,
      );
    },
  };
}
