// Match the opaque pixel threshold used for console hit testing.
export const consoleAlphaThreshold = 160;

export function traceConsoleContour(pixels: Uint8ClampedArray, width: number, height: number) {
  const tops = new Int32Array(width);
  const points: number[] = [];
  const backing = new Uint8ClampedArray(width * height * 4);
  for (let x = 0; x < width; x++) {
    let y = 0;
    while (y < height && pixels[(y * width + x) * 4 + 3] < consoleAlphaThreshold) y++;
    tops[x] = y;
    // Follow pixel boundaries, including steps, without diagonal shortcuts.
    points.push(x, y, x + 1, y);
    for (; y < height; y++) backing[(y * width + x) * 4 + 3] = 255;
  }
  return { points, tops, backing };
}
