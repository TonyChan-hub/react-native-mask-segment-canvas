import type { SegmentMaskResult } from './maskSegmentation';
/** 非墙像素在 wallSubLabels 中的占位值 */
export declare const WALL_SUB_LABEL_NONE = 255;
/**
 * 在语义分割完成后，将 wall 区域按原图纹理特征细分为 wall-1、wall-2…
 */
export declare function splitWallRegionsByTexture(result: SegmentMaskResult, originBgr: Uint8Array, cols: number, rows: number, minArea: number): SegmentMaskResult;
export declare function isWallSubRegionName(name: string): boolean;
//# sourceMappingURL=wallTextureSplit.d.ts.map