import {
  Skia,
  AlphaType,
  ColorType,
  type SkImage,
} from '@shopify/react-native-skia';

/** 连续 RGBA 缓冲 → Skia 图像（高低频 / 工作分辨率原图内存直传，避免 PNG 落盘） */
export function rgbaBufferToSkiaImage(
  buffer: Uint8Array,
  cols: number,
  rows: number,
): SkImage | null {
  const data = Skia.Data.fromBytes(buffer);
  return Skia.Image.MakeImage(
    {
      width: cols,
      height: rows,
      alphaType: AlphaType.Opaque,
      colorType: ColorType.RGBA_8888,
    },
    data,
    cols * 4,
  );
}
