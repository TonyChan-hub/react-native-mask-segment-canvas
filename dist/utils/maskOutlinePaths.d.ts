import { type SkPath } from '@shopify/react-native-skia';
import type { SegmentRegion, RegionMaskData } from './maskSegmentation';
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
//# sourceMappingURL=maskOutlinePaths.d.ts.map