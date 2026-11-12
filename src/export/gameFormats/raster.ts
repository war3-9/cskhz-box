export interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}
export function validateRaster({ width, height, data }: Raster) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096 ||
    data.length !== width * height * 4
  )
    throw new Error("图片像素数据或尺寸无效");
}

export function mipmap(source: Raster): Raster {
  const width = Math.max(1, source.width >> 1),
    height = Math.max(1, source.height >> 1);
  const data = new Uint8Array(width * height * 4);
  // Average premultiplied colors so transparent pixels do not create dark fringes.
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sum = [0, 0, 0, 0];
      let samples = 0;
      for (let dy = 0; dy < Math.min(2, source.height); dy++)
        for (let dx = 0; dx < Math.min(2, source.width); dx++) {
          const i = ((y * 2 + dy) * source.width + x * 2 + dx) * 4;
          const alpha = source.data[i + 3];
          for (let c = 0; c < 3; c++) sum[c] += source.data[i + c] * alpha;
          sum[3] += alpha;
          samples++;
        }
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++)
        data[i + c] = sum[3] ? Math.round(sum[c] / sum[3]) : 0;
      data[i + 3] = Math.round(sum[3] / samples);
    }
  return { width, height, data };
}
