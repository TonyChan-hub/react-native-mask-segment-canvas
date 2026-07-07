import type { SegmentMaskResult } from './maskSegmentation';
/** Placeholder value for non-wall pixels in wallSubLabels */
export declare const WALL_SUB_LABEL_NONE = 255;
export declare function buildPickMapAfterWallSplit(labels: Uint8Array, baseboardBinary: Uint8Array, wallIdx: number, wallSubLabels: Uint8Array, indexToName: string[], nameToId: Map<string, number>, cols: number, rows: number): Uint8Array;
/**
 * Manual lasso split: copy the existing pick map and rewrite wall pixels only.
 * Non-wall pick codes stay identical so prior paints and hit-testing remain stable.
 */
export declare function patchPickMapForManualWallSplit(existingPick: Uint8Array, labels: Uint8Array, baseboardBinary: Uint8Array, wallIdx: number, wallSubLabels: Uint8Array, nameToId: Map<string, number>, cols: number, rows: number): Uint8Array;
export declare function dilatePickBuffer1px(pick: Uint8Array, cols: number, rows: number): Uint8Array;
export type LassoPolyBBox = {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * Morphologically dilate each lasso polygon into adjacent unassigned wall pixels
 * (up to `dilateRadius` seg pixels) so thin gaps against the wall mask merge in.
 */
export declare function absorbSmallWallGapsForLassoPolygons(polyLabels: Uint8Array, polyCount: number, areas: number[], bboxes: LassoPolyBBox[], labels: Uint8Array, baseboardBinary: Uint8Array, wallSemanticIdx: number, priorAssignedLabels: Uint8Array, cols: number, rows: number, dilateRadius: number): void;
/**
 * After semantic segmentation, subdivide the wall region into wall-1, wall-2… by source image texture features
 */
export declare function splitWallRegionsByTexture(result: SegmentMaskResult, originBgr: Uint8Array, cols: number, rows: number, minArea: number): SegmentMaskResult;
export declare function isWallSubRegionName(name: string): boolean;
