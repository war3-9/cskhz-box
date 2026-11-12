import { expect, it } from "vitest";
import { encodeBlp } from "./blp";
import { encodeTga } from "./tga";
import { mipmap } from "./raster";
import { blpDimensions } from "./settings";

const raster = {
  width: 2,
  height: 2,
  data: new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 255, 64,
  ]),
};
it("writes BLP1 palette, separate alpha and a complete mip chain", () => {
  const bytes = encodeBlp(raster),
    view = new DataView(bytes.buffer);
  expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("BLP1");
  expect(view.getUint32(4, true)).toBe(1);
  expect(view.getUint32(8, true)).toBe(8);
  expect(view.getUint32(12, true)).toBe(2);
  expect(view.getUint32(20, true)).toBe(4);
  expect(view.getUint32(28, true)).toBe(1180);
  expect(view.getUint32(92, true)).toBe(8);
  expect(Array.from(bytes.subarray(1184, 1188))).toEqual([255, 128, 0, 64]);
  expect(view.getUint32(32, true)).toBe(1188);
  expect(view.getUint32(96, true)).toBe(2);
  expect(view.getUint32(36, true)).toBe(0);
  expect(bytes.length).toBe(1190);
  const palette = 156 + bytes[1180] * 4;
  expect(Array.from(bytes.subarray(palette, palette + 3))).toEqual([0, 0, 255]);
});
it("writes opaque BLP without alpha and preserves rectangular mip dimensions", () => {
  const bytes = encodeBlp({
    width: 4,
    height: 1,
    data: new Uint8Array(Array.from({ length: 16 }, () => 255)),
  });
  const view = new DataView(bytes.buffer);
  expect(view.getUint32(8, true)).toBe(0);
  expect([0, 1, 2].map((i) => view.getUint32(92 + i * 4, true))).toEqual([
    4, 2, 1,
  ]);
  expect(view.getUint32(20, true)).toBe(5);
});
it("writes TGA BGRA bottom-up pixels, exact alpha, dimensions and footer", () => {
  const bytes = encodeTga(raster),
    view = new DataView(bytes.buffer);
  expect(bytes[2]).toBe(2);
  expect(view.getUint16(12, true)).toBe(2);
  expect(view.getUint16(14, true)).toBe(2);
  expect([bytes[16], bytes[17]]).toEqual([32, 8]);
  expect(Array.from(bytes.subarray(18, 34))).toEqual([
    255, 0, 0, 0, 255, 255, 255, 64, 0, 0, 255, 255, 0, 255, 0, 128,
  ]);
  expect(new TextDecoder().decode(bytes.subarray(-18))).toBe(
    "TRUEVISION-XFILE.\0",
  );
});
it("averages mip alpha and premultiplied color without transparent-edge contamination", () => {
  const result = mipmap({
    width: 2,
    height: 2,
    data: new Uint8Array([
      255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0,
    ]),
  });
  expect(Array.from(result.data)).toEqual([255, 0, 0, 64]);
});
it("sizes BLP output safely and rejects invalid buffers or non-power-of-two data", () => {
  expect(blpDimensions(122, 300)).toEqual({ width: 128, height: 512 });
  expect(blpDimensions(300, 122, 64)).toEqual({ width: 64, height: 64 });
  expect(() => blpDimensions(128, 128, 123)).toThrow();
  expect(() =>
    encodeBlp({ width: 3, height: 1, data: new Uint8Array(12) }),
  ).toThrow();
  expect(() => encodeTga({ ...raster, data: new Uint8Array(1) })).toThrow();
});
