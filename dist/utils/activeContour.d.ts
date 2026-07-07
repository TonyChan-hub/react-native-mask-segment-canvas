/**
 * Active Contour Model — greedy snake + balloon force.
 *
 * After the user finishes a lasso polygon, this module refines the boundary
 * vertices outward toward the true wall-mask edge. Each vertex samples
 * positions along its outward normal and picks the one with lowest energy.
 *
 * Pipeline:
 *   1. Subdivide polygon to get evenly-spaced control points
 *   2. For each iteration (3-5 rounds):
 *      a. Compute outward normal at each point
 *      b. Sample N positions along the normal (outward first, then inward)
 *      c. Score each position: E = E_edge + E_smooth
 *      d. Move vertex to min-energy position (constrained to wall mask)
 *   3. Douglas-Peucker simplify
 */
import { type WallMaskSample } from './magneticLasso';
export type ActiveContourOpts = {
    /** Number of greedy iterations (default 3). */
    iterations?: number;
    /** Number of sample positions along normal per direction (default 6). */
    samplesPerDirection?: number;
    /** Step size (norm coords) between samples (default 0.003). */
    sampleStep?: number;
    /** Smoothness weight — higher keeps vertices more uniformly spaced (default 0.15). */
    smoothWeight?: number;
    /** Edge weight — higher makes contour hug mask boundary (default 1.0). */
    edgeWeight?: number;
    /** Balloon bias — extra outward push per iteration (default 0.002). */
    balloonForce?: number;
    /** Minimum vertex count for a polygon to be refined (default 4). */
    minVertices?: number;
};
/**
 * Refine a single closed lasso polygon to hug the wall-mask outer boundary.
 *
 * Returns a new vertex list (not mutated in place). Returns the original
 * polygon unchanged if it has too few vertices or no wall mask is given.
 */
export declare function refinePolygonToWallEdges(vertices: {
    x: number;
    y: number;
}[], mask: WallMaskSample, opts?: ActiveContourOpts): {
    x: number;
    y: number;
}[];
