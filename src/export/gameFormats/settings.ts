export interface EncodeOptions {
  blpSize?: number;
}
export const blpSizes = [64, 128, 256, 512, 1024, 2048, 4096];
export function blpDimensions(width: number, height: number, size = 0) {
  if (size && !blpSizes.includes(size)) throw new Error("BLP 尺寸无效");
  const next = (value: number) => 2 ** Math.ceil(Math.log2(value));
  return { width: size || next(width), height: size || next(height) };
}
