import { type SkPath } from '@shopify/react-native-skia';
import type { SegmentRegion, RegionMaskData } from './maskSegmentation';
export declare function floodFillComponent(binary: Uint8Array, cols: number, rows: number, seedX: number, seedY: number): Uint8Array | null;
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
/**
 * Canvas-space guide-dot centers for each region: largest-component mass
 * centroid, snapped onto the mask so concave shapes still get an in-region point.
 */
export declare function buildAllRegionGuideCenters(regions: SegmentRegion[], maskData: RegionMaskData, rect: {
    x: number;
    y: number;
    w: number;
    h: number;
}): Map<number, {
    x: number;
    y: number;
}>;
