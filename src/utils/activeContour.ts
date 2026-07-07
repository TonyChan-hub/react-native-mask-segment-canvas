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

import {
  isNormPointOnWallMask,
  type WallMaskSample,
} from './magneticLasso';

/* ==========================================================================
 * Types
 * ========================================================================== */

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

const DEFAULT_OPTS: Required<ActiveContourOpts> = {
  iterations: 3,
  samplesPerDirection: 6,
  sampleStep: 0.003,
  smoothWeight: 0.15,
  edgeWeight: 1.0,
  balloonForce: 0.002,
  minVertices: 4,
};

/* ==========================================================================
 * Helpers
 * ========================================================================== */

function computeOutwardNormal(
  prev: { x: number; y: number },
  curr: { x: number; y: number },
  next: { x: number; y: number },
): { x: number; y: number } {
  const dx1 = curr.x - prev.x;
  const dy1 = curr.y - prev.y;
  const dx2 = next.x - curr.x;
  const dy2 = next.y - curr.y;

  // Average tangent direction at curr
  const tx = dx1 + dx2;
  const ty = dy1 + dy2;

  // Normal (rotate 90° CCW) — two candidates
  const nx1 = -ty;
  const ny1 = tx;
  const nx2 = ty;
  const ny2 = -tx;

  // Choose the outward normal: the one that points away from centroid
  // A simple heuristic: the direction with positive dot product with
  // (curr - centroid). Since we can't compute centroid cheaply each time,
  // use a nearby point approximation: the direction that points to larger
  // edge energy (i.e., toward wall boundary). We'll pick the direction
  // that pushes the polygon out.
  //
  // For now we use the convention: the normal pointing toward positive
  // sweep (CCW polygon → normal should point outward).
  // We'll verify by computing the cross product of the normal with the
  // edge direction.
  const cross1 = dx2 * ny1 - dy2 * nx1;
  const cross2 = dx2 * ny2 - dy2 * nx2;

  const len = Math.hypot(nx1, ny1);
  if (len < 1e-8) {
    return { x: 0, y: 0 };
  }

  // For a CCW polygon, the outward normal is the one with negative cross product
  const [nx, ny] = cross1 < cross2 ? [nx1, ny1] : [nx2, ny2];

  return {
    x: nx / len,
    y: ny / len,
  };
}

/**
 * Distance to the nearest wall-mask boundary pixel.
 * Returns [0..∞) in normalized coordinate space.
 * Uses a fast spiral search within maxRadius.
 */
function distToWallBoundary(
  normX: number,
  normY: number,
  mask: WallMaskSample,
  maxRadius: number,
): number {
  const { labels, baseboardBinary, cols, rows, wallSemanticIdx } = mask;
  if (cols <= 0 || rows <= 0) return maxRadius;

  const cx = Math.round(normX * cols);
  const cy = Math.round(normY * rows);
  const r = Math.ceil(maxRadius);
  let best = maxRadius + 1;

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const i = y * cols + x;
      if (labels[i] !== wallSemanticIdx || baseboardBinary[i]) continue;
      // Check if this is a boundary pixel (adjacent to non-wall)
      if (
        x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ||
        labels[i - 1] !== wallSemanticIdx ||
        labels[i + 1] !== wallSemanticIdx ||
        labels[i - cols] !== wallSemanticIdx ||
        labels[i + cols] !== wallSemanticIdx
      ) {
        const dist = Math.hypot(dx, dy);
        if (dist < best) best = dist;
      }
    }
  }

  // Convert from seg pixels to normalized space
  return best / Math.max(cols, rows);
}

/**
 * Score a candidate position:
 *   E = edgeWeight * edgeEnergy + smoothWeight * smoothEnergy - balloonForce
 *
 * Lower score = better.
 * Edge energy is distance to nearest wall boundary (0 = on boundary).
 * Smooth energy penalizes large deviations from the median of neighbors.
 */
function scorePosition(
  nx: number,
  ny: number,
  mask: WallMaskSample,
  maxEdgeDist: number,
  neighbors: { x: number; y: number }[],
  opts: Required<ActiveContourOpts>,
): number {
  if (!isNormPointOnWallMask(nx, ny, mask)) {
    return 1e6; // reject
  }

  const edge = distToWallBoundary(nx, ny, mask, maxEdgeDist) / maxEdgeDist;

  let smooth = 0;
  if (neighbors.length >= 2) {
    const n0 = neighbors[0];
    const n1 = neighbors[neighbors.length - 1];
    const mx = (n0.x + n1.x) / 2;
    const my = (n0.y + n1.y) / 2;
    smooth = Math.hypot(nx - mx, ny - my);
  }

  return opts.edgeWeight * edge + opts.smoothWeight * smooth;
}

/* ==========================================================================
 * Subdivision — insert points where consecutive vertices are far apart
 * ========================================================================== */

function subdividePolygon(
  vertices: { x: number; y: number }[],
  maxGap: number,
): { x: number; y: number }[] {
  if (vertices.length < 2) return [...vertices];
  const result: { x: number; y: number }[] = [];
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    result.push({ ...a });
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.floor(dist / maxGap);
    if (steps > 1) {
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        result.push({
          x: a.x + t * (b.x - a.x),
          y: a.y + t * (b.y - a.y),
        });
      }
    }
  }
  return result;
}

/* ==========================================================================
 * Main
 * ========================================================================== */

/**
 * Refine a single closed lasso polygon to hug the wall-mask outer boundary.
 *
 * Returns a new vertex list (not mutated in place). Returns the original
 * polygon unchanged if it has too few vertices or no wall mask is given.
 */
export function refinePolygonToWallEdges(
  vertices: { x: number; y: number }[],
  mask: WallMaskSample,
  opts?: ActiveContourOpts,
): { x: number; y: number }[] {
  const o = { ...DEFAULT_OPTS, ...opts };
  if (vertices.length < o.minVertices || !mask) {
    return [...vertices];
  }

  // 1. Subdivide to get evenly-spaced control points
  let points = subdividePolygon(vertices, o.sampleStep * 2);

  // 2. Greedy iteration loop
  const maxEdgeDist = o.samplesPerDirection * o.sampleStep * Math.max(mask.cols, mask.rows);
  const segPxEdgeDist = o.samplesPerDirection * o.sampleStep * Math.max(mask.cols, mask.rows);

  for (let iter = 0; iter < o.iterations; iter++) {
    const newPoints: { x: number; y: number }[] = [];
    const m = points.length;

    for (let i = 0; i < m; i++) {
      const prev = points[(i - 1 + m) % m];
      const curr = points[i];
      const next = points[(i + 1) % m];

      const normal = computeOutwardNormal(prev, curr, next);
      if (normal.x === 0 && normal.y === 0) {
        newPoints.push({ ...curr });
        continue;
      }

      let bestPt = { ...curr };
      let bestScore = scorePosition(
        curr.x, curr.y, mask, segPxEdgeDist,
        [prev, next], o,
      );

      // Apply balloon force: bias outward by extra offset
      const balloonOffset = o.balloonForce * (iter + 1);

      // Sample positions: outward first (balloon force region), then inward
      for (let d = 1; d <= o.samplesPerDirection; d++) {
        const dist = d * o.sampleStep;

        // Outward (balloon direction)
        const nxOut = curr.x + normal.x * (dist + balloonOffset);
        const nyOut = curr.y + normal.y * (dist + balloonOffset);
        const scoreOut = scorePosition(
          nxOut, nyOut, mask, segPxEdgeDist,
          [newPoints.length > 0 ? newPoints[newPoints.length - 1] : points[(i - 1 + m) % m], next],
          o,
        );
        if (scoreOut < bestScore) {
          bestScore = scoreOut;
          bestPt = { x: nxOut, y: nyOut };
        }

        // Inward (conservative)
        const nxIn = curr.x - normal.x * dist;
        const nyIn = curr.y - normal.y * dist;
        const scoreIn = scorePosition(
          nxIn, nyIn, mask, segPxEdgeDist,
          [newPoints.length > 0 ? newPoints[newPoints.length - 1] : points[(i - 1 + m) % m], next],
          o,
        );
        if (scoreIn < bestScore) {
          bestScore = scoreIn;
          bestPt = { x: nxIn, y: nyIn };
        }
      }

      newPoints.push(bestPt);
    }

    points = newPoints;
  }

  // 3. Douglas-Peucker simplify
  const simplified = douglasPeucker(points, 0.002);
  if (simplified.length < 3) return [...vertices];

  // Ensure closed
  const first = simplified[0];
  const last = simplified[simplified.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) > 0.0005) {
    simplified.push({ ...first });
  }

  return simplified;
}

/* ==========================================================================
 * Douglas-Peucker (inlined for independence)
 * ========================================================================== */

function douglasPeucker(
  path: { x: number; y: number }[],
  epsilon: number,
): { x: number; y: number }[] {
  if (path.length <= 2) return [...path];

  const keep = new Uint8Array(path.length);
  keep[0] = 1;
  keep[path.length - 1] = 1;

  function recurse(s: number, e: number) {
    if (e - s <= 1) return;
    const ax = path[s].x;
    const ay = path[s].y;
    const bx = path[e].x;
    const by = path[e].y;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    let maxDist = 0;
    let maxIdx = s;
    for (let i = s + 1; i < e; i++) {
      let dist: number;
      if (lenSq === 0) {
        dist = Math.hypot(path[i].x - ax, path[i].y - ay);
      } else {
        const t = Math.max(0, Math.min(1,
          ((path[i].x - ax) * dx + (path[i].y - ay) * dy) / lenSq,
        ));
        const px = ax + t * dx;
        const py = ay + t * dy;
        dist = Math.hypot(path[i].x - px, path[i].y - py);
      }
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    if (maxDist > epsilon) {
      keep[maxIdx] = 1;
      recurse(s, maxIdx);
      recurse(maxIdx, e);
    }
  }

  recurse(0, path.length - 1);

  // Enforce minimum distance between consecutive anchors
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < path.length; i++) {
    if (!keep[i]) continue;
    if (result.length > 0) {
      const last = result[result.length - 1];
      if (Math.hypot(path[i].x - last.x, path[i].y - last.y) < 0.001) continue;
    }
    result.push({ x: path[i].x, y: path[i].y });
  }

  return result;
}
