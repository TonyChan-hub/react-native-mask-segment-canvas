declare module 'upng-js' {
  export interface UPNGImage {
    width: number;
    height: number;
    depth: number;
    ctype: number;
    frames: number;
    tabs: Record<string, string>;
    data: ArrayBuffer;
  }

  export function decode(buffer: ArrayBuffer): UPNGImage;

  export function toRGBA8(img: UPNGImage): ArrayBuffer[];

  export function encode(
    imgs: ArrayBuffer[],
    w: number,
    h: number,
    cnum: number,
    dels?: number[],
  ): ArrayBuffer;

  export function encodeLL(
    imgs: ArrayBuffer[],
    w: number,
    h: number,
    cc: number,
    ac: number,
    depth: number,
    dels?: number[],
  ): ArrayBuffer;
}
