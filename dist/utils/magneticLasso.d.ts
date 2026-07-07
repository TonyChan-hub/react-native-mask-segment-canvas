/**
 * Magnetic Lasso — edge-snapping polygon placement for manual wall splitting.
 *
 * Pipeline:
 *   1. buildEnergyMap   → grayscale + downsample + Sobel gradient → energy grid
 *   2. findShortestPath → Dijkstra 8-connected on low-energy (edge) pixels
 *   3. extractCornerPoints → Douglas-Peucker simplification on raw path
 *   4. upscalePath      → map energy-space coords back to original image coords
 */
export type EnergyMap = {
    /** Float32Array per-pixel energy values [0…1]; low = edge, high = flat */
    map: Float32Array;
    w: number;
    h: number;
    /** Downscale ratio: energyDim / sourceDim (≈ em.w / sourceCols) */
    scale: number;
    /** Optional 0/1 mask at energy resolution; 0 = blocked for pathfinding */
    traversable?: Uint8Array;
};
/** Seg-resolution wall mask used to constrain lasso vertices. */
export type WallMaskSample = {
    labels: Uint8Array;
    baseboardBinary: Uint8Array;
    cols: number;
    rows: number;
    wallSemanticIdx: number;
};
/** True when norm coords fall on a wall semantic pixel (excludes baseboard). */
export declare function isNormPointOnWallMask(normX: number, normY: number, mask: WallMaskSample): boolean;
export declare function filterVerticesToWallMask<T extends {
    x: number;
    y: number;
}>(vertices: T[], mask: WallMaskSample): T[];
/**
 * Snap a normalized point to the nearest wall-mask boundary pixel when the
 * touch falls within `snapRadiusSegPx` (segmentation resolution) of the edge.
 */
export declare function snapNormPointToWallEdge(normX: number, normY: number, mask: WallMaskSample, snapRadiusSegPx?: number): {
    x: number;
    y: number;
};
/**
 * Prefer wall-mask corner pixels (L-shaped outer boundary), then plain edge.
 * Used when the user taps without dragging.
 */
export declare function snapNormPointToWallCornerOrEdge(normX: number, normY: number, mask: WallMaskSample, snapRadiusSegPx?: number): {
    x: number;
    y: number;
};
/**
 * During vertex drag: snap to corner/edge when near, otherwise keep interior
 * wall points so the anchor can move freely on the wall mask.
 */
export declare function resolveLassoWallDragPoint(normX: number, normY: number, mask: WallMaskSample, snapRadiusSegPx?: number): {
    x: number;
    y: number;
} | null;
export declare function buildWallAllowedMask(labels: Uint8Array, baseboardBinary: Uint8Array, wallSemanticIdx: number): Uint8Array | null;
/**
 * Build per-pixel energy map from BGR buffer.
 * 1. Convert to grayscale via luminance weights
 * 2. Downsample so longest side ≤ targetMaxSide
 * 3. Apply Sobel 3×3 → gradient magnitude G
 * 4. Energy = 1 / (1 + G), clamped to [0, 1]
 */
export declare function buildEnergyMap(bgrBuffer: Uint8Array, cols: number, rows: number, targetMaxSide?: number, allowedMask?: Uint8Array | null): EnergyMap;
/**
 * Dijkstra shortest-path on 8-connected grid.
 * Cost at each pixel = energy[pixel] * COST_SCALE (integer).
 * Diagonal steps cost √2 × the neighbour's energy.
 *
 * Returns ordered path [start, …, end] in energy-map pixel space.
 */
export declare function findShortestPath(energy: Float32Array, energyW: number, energyH: number, sx: number, sy: number, ex: number, ey: number, traversable?: Uint8Array | null): {
    x: number;
    y: number;
}[];
/**
 * Douglas-Peucker simplification. Keeps points where the perpendicular
 * distance from the line segment exceeds epsilon.
 *
 * After DP, also enforces a minimum distance between consecutive anchors
 * to avoid overly dense clusters.
 */
export declare function extractCornerPoints(path: {
    x: number;
    y: number;
}[], minDistance?: number, epsilon?: number): {
    x: number;
    y: number;
}[];
/** Map normalized image coords (0..1) to energy-map pixel coords. */
export declare function normToEnergyPoint(normX: number, normY: number, em: EnergyMap): {
    x: number;
    y: number;
};
/** Map energy-map pixel coords back to normalized image coords. */
export declare function energyPointsToNorm(points: {
    x: number;
    y: number;
}[], em: EnergyMap): {
    x: number;
    y: number;
}[];
/** Map energy-map pixel coords back to original image coords. */
export declare function upscalePath(points: {
    x: number;
    y: number;
}[], scale: number, originW: number, originH: number): {
    x: number;
    y: number;
}[];
