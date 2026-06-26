import { type WrappedMat } from './opencvAdapter';
import { type SkPath } from '@shopify/react-native-skia';
export type RegionPickMap = {
    buffer: Uint8Array;
    cols: number;
    rows: number;
};
export type SegmentMaskResult = {
    regions: SegmentRegion[];
    pickMap: RegionPickMap;
    labels: Uint8Array;
    baseboardBinary: Uint8Array;
    segCols: number;
    segRows: number;
};
export type SegmentRegion = {
    id: number;
    /** 语义分区名（door / cabinet / baseboard …） */
    name: string;
    /** 参考色 hex */
    hex: string;
    /** 参考色（BGR） */
    color: {
        b: number;
        g: number;
        r: number;
    };
    polygons: {
        x: number;
        y: number;
    }[][];
    /** 上色/高亮蒙版：严格像素条带，不填充黑色空洞 */
    maskPolygons?: {
        x: number;
        y: number;
    }[][];
    hitPolygons?: {
        x: number;
        y: number;
    }[][];
    outlinePolygons?: {
        x: number;
        y: number;
    }[][];
    bbox: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    area: number;
    /** 踢脚线等细条区域，点击检测需加宽容差 */
    thinStrip?: boolean;
};
export declare function buildRegionOutlinePolygons(reg: SegmentRegion): NormPoint[][];
export declare function buildRegionOutlinePathForRegion(regionId: number, regions: SegmentRegion[], maskData: RegionMaskData, rect: {
    x: number;
    y: number;
    w: number;
    h: number;
}, normSeed?: {
    x: number;
    y: number;
}): SkPath;
export declare function buildAllRegionOutlinePaths(regions: SegmentRegion[], maskData: RegionMaskData, rect: {
    x: number;
    y: number;
    w: number;
    h: number;
}): Map<number, SkPath>;
/** 从二值图逐行条带构建蒙版（供 Skia PathBuilder 使用） */
export declare function appendMaskBinaryToPathBuilder(binary: Uint8Array, cols: number, rows: number, rect: {
    x: number;
    y: number;
    w: number;
    h: number;
}, builder: {
    moveTo: (x: number, y: number) => unknown;
    lineTo: (x: number, y: number) => unknown;
    close: () => unknown;
}, minRunPx?: number): void;
/** 从语义标签逐行条带构建蒙版（避免维护多张二值图） */
export declare function appendLabelMaskToPathBuilder(labels: Uint8Array, semanticIndex: number, cols: number, rows: number, rect: {
    x: number;
    y: number;
    w: number;
    h: number;
}, builder: {
    moveTo: (x: number, y: number) => unknown;
    lineTo: (x: number, y: number) => unknown;
    close: () => unknown;
}, minRunPx?: number): void;
export type RegionMaskData = {
    labels: Uint8Array;
    baseboardBinary: Uint8Array;
    cols: number;
    rows: number;
};
/** 蒙版路径构建降采样（屏幕显示不需要分割分辨率，点击仍用全分辨率 pickMap） */
export declare function downsampleMaskDataForPaths(maskData: RegionMaskData, maxLongSide: number): RegionMaskData;
/** 单次扫描构建所有分区 Skia 蒙版路径（单 label pass，避免每像素 × 语义数循环） */
export declare function buildAllRegionMaskPaths(regions: SegmentRegion[], maskData: RegionMaskData, rect: {
    x: number;
    y: number;
    w: number;
    h: number;
}): Map<number, SkPath>;
type NormPoint = {
    x: number;
    y: number;
};
export declare function buildBaseboardBinaryFromMask(buffer: Uint8Array, cols: number, rows: number): Uint8Array;
/** 分割分辨率踢脚线二值图最近邻放大到点击查表分辨率（避免全图 junction 重算） */
export declare function upscaleBinaryMask(src: Uint8Array, srcCols: number, srcRows: number, dstCols: number, dstRows: number): Uint8Array;
export declare function isBaseboardMaskPixel(buffer: Uint8Array, cols: number, rows: number, x: number, y: number, baseboardBinary?: Uint8Array | null): boolean;
export { isStrictBaseboardPixel as isBaseboardPixel } from './maskSemanticPalette';
export declare function getMaskQuantKey(b: number, g: number, r: number): string;
/** @deprecated 请使用 isBaseboardMaskPixel */
export declare function isKickPlatePixel(b: number, g: number, r: number): boolean;
export declare function extractRegionsFromMaskBuffer(buffer: Uint8Array, cols: number, rows: number, _options: {
    minArea: number;
    approxEpsilon: number;
}): Promise<SegmentMaskResult>;
export declare function extractRegionsFromMaskBufferSync(buffer: Uint8Array, cols: number, rows: number, _options: {
    minArea: number;
    approxEpsilon: number;
}): SegmentMaskResult;
/** @deprecated 请使用 extractRegionsFromMaskBuffer */
export declare function extractRegionsFromMask(maskMat: WrappedMat, options: {
    minArea: number;
    approxEpsilon: number;
}): Promise<SegmentRegion[]>;
//# sourceMappingURL=maskSegmentation.d.ts.map