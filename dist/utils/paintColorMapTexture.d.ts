import { type SkImage } from '@shopify/react-native-skia';
import type { BgrColor } from '../components/MaskSegmentCanvas.types';
/** 按 pickMap 展开的上色颜色图（与 pick 同尺寸，未上色像素 a=0）。支持 maskFeather 产生软边缘 alpha。 */
export declare function buildPaintColorMapImage(pickBuffer: Uint8Array, cols: number, rows: number, paintedRegions: Map<number, BgrColor>, featherRadius?: number): SkImage;
//# sourceMappingURL=paintColorMapTexture.d.ts.map