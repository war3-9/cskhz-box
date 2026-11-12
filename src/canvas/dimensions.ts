export const MIN_CANVAS_SIZE = 64;
export const MAX_CANVAS_SIZE = 4096;

export const validCanvasSize = (width: number, height: number) =>
  [width, height].every(
    (value) =>
      Number.isInteger(value) &&
      value >= MIN_CANVAS_SIZE &&
      value <= MAX_CANVAS_SIZE,
  );
