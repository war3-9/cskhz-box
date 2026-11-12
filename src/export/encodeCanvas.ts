import type { BatchFormat } from "./batchConfig";
import { blpDimensions, type EncodeOptions } from "./gameFormats/settings";

export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: BatchFormat,
  quality = 0.95,
  options: EncodeOptions = {},
): Promise<Blob> {
  if (format === "blp" || format === "tga") {
    let output = canvas;
    if (format === "blp") {
      const size = blpDimensions(canvas.width, canvas.height, options.blpSize);
      if (size.width !== canvas.width || size.height !== canvas.height) {
        output = document.createElement("canvas");
        output.width = size.width;
        output.height = size.height;
        const context = output.getContext("2d")!;
        context.imageSmoothingQuality = "high";
        context.drawImage(canvas, 0, 0, size.width, size.height);
      }
    }
    const { width, height } = output;
    const raster = {
      width,
      height,
      data: new Uint8Array(
        output.getContext("2d")!.getImageData(0, 0, width, height).data,
      ),
    };
    const bytes =
      format === "blp"
        ? (await import("./gameFormats/blp")).encodeBlp(raster)
        : (await import("./gameFormats/tga")).encodeTga(raster);
    return new Blob([bytes], {
      type: format === "blp" ? "image/blp" : "image/x-tga",
    });
  }
  if (["png", "jpeg", "webp"].includes(format)) {
    const mime = `image/${format}`;
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.type !== mime)
            reject(new Error(`当前环境不支持 ${format.toUpperCase()} 编码`));
          else resolve(blob);
        },
        mime,
        quality,
      ),
    );
  }
  const { width, height } = canvas;
  const rgba = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
  if (format === "tiff") {
    const { default: UTIF } = await import("utif");
    return new Blob(
      [UTIF.encodeImage(rgba.buffer as ArrayBuffer, width, height)],
      { type: "image/tiff" },
    );
  }
  if (format === "gif") {
    const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
    const data = new Uint8Array(rgba.buffer);
    const palette = quantize(data, 256, {
      format: "rgba4444",
      oneBitAlpha: true,
    });
    const transparentIndex = palette.findIndex((color) => color[3] === 0);
    const encoder = GIFEncoder();
    encoder.writeFrame(applyPalette(data, palette, "rgba4444"), width, height, {
      palette,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
    });
    encoder.finish();
    return new Blob([new Uint8Array(encoder.bytes())], { type: "image/gif" });
  }
  // bmp-js expects ABGR bytes; composite transparency against white for 24-bit BMP.
  const { Buffer } = await import("buffer");
  const bufferHost = globalThis as typeof globalThis & {
    Buffer?: typeof Buffer;
  };
  bufferHost.Buffer ??= Buffer;
  const { default: bmp } = await import("bmp-js");
  const abgr = Buffer.alloc(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3] / 255;
    abgr[i] = 255;
    for (let c = 0; c < 3; c++)
      abgr[i + 1 + c] = Math.round(rgba[i + 2 - c] * alpha + 255 * (1 - alpha));
  }
  return new Blob(
    [new Uint8Array(bmp.encode({ data: abgr, width, height }).data)],
    { type: "image/bmp" },
  );
}
