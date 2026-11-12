import { quantize, applyPalette } from "gifenc";
import { mipmap, validateRaster, type Raster } from "./raster";

export function encodeBlp(source: Raster): Uint8Array<ArrayBuffer> {
  validateRaster(source);
  if (source.width & (source.width - 1) || source.height & (source.height - 1))
    throw new Error("BLP 宽高必须为 2 的幂");
  const levels = [source];
  while (levels.at(-1)!.width > 1 || levels.at(-1)!.height > 1)
    levels.push(mipmap(levels.at(-1)!));
  const palette = quantize(new Uint8Array(source.data), 256, {
    format: "rgb565",
  });
  const alphaBits = source.data.some(
    (value, index) => index % 4 === 3 && value !== 255,
  )
    ? 8
    : 0;
  const headerSize = 156 + 1024;
  const bytes = new Uint8Array(
    headerSize +
      levels.reduce(
        (sum, level) => sum + level.width * level.height * (alphaBits ? 2 : 1),
        0,
      ),
  );
  const view = new DataView(bytes.buffer);
  bytes.set([66, 76, 80, 49]);
  view.setUint32(4, 1, true); // BLP1 palette compression.
  view.setUint32(8, alphaBits, true);
  view.setUint32(12, source.width, true);
  view.setUint32(16, source.height, true);
  view.setUint32(20, alphaBits ? 4 : 5, true);
  view.setUint32(24, 1, true); // Full mip chain is present.
  palette.forEach((color, index) =>
    bytes.set([color[2], color[1], color[0], 0], 156 + index * 4),
  );
  let offset = headerSize;
  levels.forEach((level, index) => {
    const count = level.width * level.height;
    const size = count * (alphaBits ? 2 : 1);
    view.setUint32(28 + index * 4, offset, true);
    view.setUint32(92 + index * 4, size, true);
    bytes.set(
      applyPalette(new Uint8Array(level.data), palette, "rgb565"),
      offset,
    );
    if (alphaBits)
      for (let i = 0; i < count; i++)
        bytes[offset + count + i] = level.data[i * 4 + 3];
    offset += size;
  });
  return bytes;
}
