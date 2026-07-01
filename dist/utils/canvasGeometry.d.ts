import { type SkImage } from '@shopify/react-native-skia';
import type { SegmentRegion } from './maskSegmentation';
import type { BgrColor } from '../components/MaskSegmentCanvas.types';
export type PaintResourceLayers = {
    lowFreqImage: SkImage;
    highFreqImage: SkImage;
};
export type ContainRect = {
    x: number;
    y: number;
    w: number;
    h: number;
};
export type WorkScaledBgr = {
    buffer: Uint8Array;
    cols: number;
    rows: number;
};
export declare function bgrColorEquals(a: BgrColor, b: BgrColor): boolean;
export declare function rectsEqual(a: ContainRect, b: ContainRect): boolean;
export declare function getContainRect(canvasW: number, canvasH: number, imgW: number, imgH: number): ContainRect;
export declare function canvasToNormalized(cx: number, cy: number, canvasW: number, canvasH: number, imgW: number, imgH: number): {
    x: number;
    y: number;
} | null;
/** Skia matrix: pan → scale around viewport center. Matches screenToCanvasCoords. */
export declare function buildZoomPanMatrix(panX: number, panY: number, scale: number, canvasW: number, canvasH: number): import("@shopify/react-native-skia").SkMatrix;
/** Clamp pan so scaled containRect does not expose empty margins beyond the viewport. */
export declare function clampPanOffset(pan: {
    x: number;
    y: number;
}, scale: number, canvasW: number, canvasH: number, containRect: ContainRect | null): {
    x: number;
    y: number;
};
/**
 * Inverse of the Skia Group transform applied during pinch-zoom.
 * Converts a raw touch point (screen pixels) back to the canvas coordinate
 * space where the image and regions are positioned before any scale/pan.
 * When zoomScale ≤ 1 (no zoom), returns the input unchanged.
 */
export declare function screenToCanvasCoords(screenX: number, screenY: number, canvasW: number, canvasH: number, zoomScale: number, panOffset: {
    x: number;
    y: number;
}): {
    x: number;
    y: number;
};
export declare function pointInPolygon(x: number, y: number, points: {
    x: number;
    y: number;
}[]): boolean;
export declare function pointInPolygonWithPadding(x: number, y: number, points: {
    x: number;
    y: number;
}[], padding: number): boolean;
export declare function getRegionHitPolygons(reg: SegmentRegion): {
    x: number;
    y: number;
}[][];
export declare function pointHitsRegion(x: number, y: number, reg: SegmentRegion, options?: {
    thinPadding?: number;
}): boolean;
export declare function pointStrictlyHitsRegion(x: number, y: number, reg: SegmentRegion): boolean;
export declare function resolveRegionHit(regions: SegmentRegion[], x: number, y: number): number | null;
export declare function pickKickRegionFromMask(normX: number, normY: number, pick: {
    buffer: Uint8Array;
    cols: number;
    rows: number;
}, kickRegionId: number, baseboardPickMask?: Uint8Array | null, strict?: boolean): number | null;
export declare function pickKickNearStrip(normX: number, normY: number, kickReg: SegmentRegion): boolean;
export declare function lookupRegionFromPickMap(normX: number, normY: number, pick: {
    buffer: Uint8Array;
    cols: number;
    rows: number;
}, radiusPx?: number): number | null;
export declare function releasePaintResourceLayers(layers: PaintResourceLayers | null): void;
export declare function releaseOriginSkImage(image: SkImage | null): void;
export declare function prepareWorkScaledBgrBuffer(bgrBuffer: Uint8Array, cols: number, rows: number, workScale: number): Promise<WorkScaledBgr>;
export declare function timeLog(tag: string): void;
//# sourceMappingURL=canvasGeometry.d.ts.map