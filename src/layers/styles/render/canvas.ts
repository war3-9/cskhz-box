export function surface(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  return canvas;
}
export function paintMask(
  mask: HTMLCanvasElement,
  color: string,
  blur = 0,
  opacity = 1,
) {
  const result = surface(mask.width, mask.height);
  const context = result.getContext("2d")!;
  context.filter = blur > 0 ? `blur(${blur}px)` : "none";
  context.drawImage(mask, 0, 0);
  context.filter = "none";
  context.globalCompositeOperation = "source-in";
  context.globalAlpha = opacity;
  context.fillStyle = color;
  context.fillRect(0, 0, result.width, result.height);
  return result;
}
export function alphaMask(source: HTMLCanvasElement) {
  const context = source.getContext("2d")!;
  const pixels = context.getImageData(0, 0, source.width, source.height).data;
  return Uint8Array.from(
    { length: pixels.length / 4 },
    (_, i) => pixels[i * 4 + 3],
  );
}
export function maskFromAlpha(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
) {
  const result = surface(width, height);
  const context = result.getContext("2d")!;
  const pixels = context.createImageData(width, height);
  for (let i = 0; i < alpha.length; i++) pixels.data[i * 4 + 3] = alpha[i];
  context.putImageData(pixels, 0, 0);
  return result;
}
