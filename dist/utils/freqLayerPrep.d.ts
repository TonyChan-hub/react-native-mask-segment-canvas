import { type WrappedMat } from './opencvAdapter';
import type { SkImage } from '@shopify/react-native-skia';
export type FreqLayerImages = {
    lowFreqImage: SkImage;
    highFreqImage: SkImage;
};
export type PaintResourceBatch = {
    originImage: SkImage;
    layers: FreqLayerImages;
};
/** OpenCV 8-bit Lab L 通道（BGR 输入，供单测与近似对照） */
export declare function bgrToLabL(b: number, g: number, r: number): number;
export declare function bgrBufferToRgbaBuffer(bgr: Uint8Array, cols: number, rows: number): Uint8Array;
export declare function releaseFreqLayerImages(layers: FreqLayerImages | null): void;
/** 复用已上传的 BGR Mat，避免重复 bufferToMat + JS↔原生往返 */
export declare function prepareFreqLayersFromWorkMat(workMat: WrappedMat, cols: number, rows: number): Promise<FreqLayerImages | null>;
/** 单次 Mat 上传 → 高低频 + 原图 Skia（并行，高低频先就绪时可回调） */
export declare function preparePaintResourcesFromWorkBuffer(bgrBuffer: Uint8Array, cols: number, rows: number, onFreqLayersReady?: (layers: FreqLayerImages) => void): Promise<PaintResourceBatch | null>;
/** @deprecated 测试兼容；生产路径请用 preparePaintResourcesFromWorkBuffer */
export declare function prepareFreqLayersFromBgrBuffer(bgrBuffer: Uint8Array, cols: number, rows: number): Promise<FreqLayerImages | null>;
/** 原图 BGR → Skia RGBA（OpenCV cvtColor，与 freq 并行） */
export declare function originBgrBufferToSkiaImage(bgrBuffer: Uint8Array, cols: number, rows: number): Promise<SkImage | null>;
//# sourceMappingURL=freqLayerPrep.d.ts.map