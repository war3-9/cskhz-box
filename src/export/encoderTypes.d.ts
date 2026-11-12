declare module "gifenc" {
  export function GIFEncoder(): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options: {
        palette: number[][];
        transparent?: boolean;
        transparentIndex?: number;
        delay?: number;
        repeat?: number;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function quantize(
    data: Uint8Array,
    count: number,
    options?: { format: string; oneBitAlpha?: boolean },
  ): number[][];
  export function applyPalette(
    data: Uint8Array,
    palette: number[][],
    format?: string,
  ): Uint8Array;
}
declare module "utif" {
  const UTIF: {
    encodeImage(data: ArrayBuffer, width: number, height: number): ArrayBuffer;
  };
  export default UTIF;
}
declare module "bmp-js" {
  const bmp: {
    encode(image: { data: Uint8Array; width: number; height: number }): {
      data: Uint8Array;
    };
  };
  export default bmp;
}
