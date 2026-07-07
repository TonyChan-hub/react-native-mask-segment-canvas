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
    /** splitWalls only: wall pixels → sub-region index 0..N-1, non-wall is WALL_SUB_LABEL_NONE */
    wallSubLabels?: Uint8Array;
};
export type SegmentRegion = {
    id: number;
    /** semantic partition name (door / cabinet / baseboard ...) */
    name: string;
    /** reference color hex */
    hex: string;
    /** reference color (BGR) */
    color: {
        b: number;
        g: number;
        r: number;
    };
    polygons: {
        x: number;
        y: number;
    }[][];
    /** paint/highlight mask: strict pixel strip, no black hole filling */
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
    /** baseboard etc. thin strip areas, click detection needs tolerance */
    thinStrip?: boolean;
};
export declare function buildRegionOutlinePolygons(reg: SegmentRegion): NormPoint[][];
import { buildAllRegionOutlinePaths, buildRegionOutlinePathForRegion } from './maskOutlinePaths';
export { buildAllRegionOutlinePaths, buildRegionOutlinePathForRegion };
/** build mask from binary mask row by row (for Skia PathBuilder) */
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
/** build mask from semantic labels row by row (avoid maintaining multiple binary masks) */
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
    wallSubLabels?: Uint8Array;
    /** Semantic index → name table captured at segmentation time (must match labels buffer). */
    indexToName?: string[];
    /** Wall semantic index in labels buffer (captured at segmentation time). */
    wallSemanticIdx?: number;
};
/** downsample mask path building (screen display does not need segmentation resolution, click still uses full resolution pickMap) */
export declare function downsampleMaskDataForPaths(maskData: RegionMaskData, maxLongSide: number): RegionMaskData;
/** single pass build all partition Skia mask paths (single label pass, avoid per pixel × semantic count loop) */
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
/** Upscale segmentation-resolution baseboard binary to tap-lookup resolution via nearest-neighbor (avoids full-image junction recomputation) */
export declare function upscaleBinaryMask(src: Uint8Array, srcCols: number, srcRows: number, dstCols: number, dstRows: number): Uint8Array;
export declare function isBaseboardMaskPixel(buffer: Uint8Array, cols: number, rows: number, x: number, y: number, baseboardBinary?: Uint8Array | null): boolean;
export { isStrictBaseboardPixel as isBaseboardPixel } from './maskSemanticPalette';
export declare function getMaskQuantKey(b: number, g: number, r: number): string;
/** @deprecated Use isBaseboardMaskPixel */
export declare function isKickPlatePixel(b: number, g: number, r: number): boolean;
export declare function extractRegionsFromMaskBuffer(buffer: Uint8Array, cols: number, rows: number, _options: {
    minArea: number;
    approxEpsilon: number;
}): Promise<SegmentMaskResult>;
export declare function extractRegionsFromMaskBufferSync(buffer: Uint8Array, cols: number, rows: number, _options: {
    minArea: number;
    approxEpsilon: number;
}): SegmentMaskResult;
/** @deprecated Use extractRegionsFromMaskBuffer */
export declare function extractRegionsFromMask(maskMat: WrappedMat, options: {
    minArea: number;
    approxEpsilon: number;
}): Promise<SegmentRegion[]>;
