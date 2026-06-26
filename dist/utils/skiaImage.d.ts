import { type SkImage } from '@shopify/react-native-skia';
/** 连续 RGBA 缓冲 → Skia 图像（高低频 / 工作分辨率原图内存直传，避免 PNG 落盘） */
export declare function rgbaBufferToSkiaImage(buffer: Uint8Array, cols: number, rows: number): SkImage | null;
//# sourceMappingURL=skiaImage.d.ts.map