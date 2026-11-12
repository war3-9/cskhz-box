import { validateRaster, type Raster } from "./raster";

export function encodeTga(source: Raster): Uint8Array<ArrayBuffer> {
  validateRaster(source);
  const bytes = new Uint8Array(18 + source.data.length + 26);
  const view = new DataView(bytes.buffer);
  bytes[2] = 2; // Uncompressed true-color, bottom-left origin.
  view.setUint16(12, source.width, true);
  view.setUint16(14, source.height, true);
  bytes[16] = 32;
  bytes[17] = 8;
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++) {
      const from = ((source.height - y - 1) * source.width + x) * 4;
      const to = 18 + (y * source.width + x) * 4;
      bytes.set(
        [
          source.data[from + 2],
          source.data[from + 1],
          source.data[from],
          source.data[from + 3],
        ],
        to,
      );
    }
  bytes.set(new TextEncoder().encode("TRUEVISION-XFILE.\0"), bytes.length - 18);
  return bytes;
}
