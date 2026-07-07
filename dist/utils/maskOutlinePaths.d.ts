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
