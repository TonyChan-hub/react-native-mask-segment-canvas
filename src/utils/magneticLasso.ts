/**
 * Magnetic Lasso — edge-snapping polygon placement for manual wall splitting.
 *
 * Pipeline:
 *   1. buildEnergyMap   → grayscale + downsample + Sobel gradient → energy grid
 *   2. findShortestPath → Dijkstra 8-connected on low-energy (edge) pixels
 *   3. extractCornerPoints → Douglas-Peucker simplification on raw path
 *   4. upscalePath      → map energy-space coords back to original image coords
 */

/* ==========================================================================
 * Types
 * ========================================================================== */

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
export function isNormPointOnWallMask(
  normX: number,
  normY: number,
  mask: WallMaskSample,
): boolean {
  const { labels, baseboardBinary, cols, rows, wallSemanticIdx } = mask;
  if (wallSemanticIdx < 0 || cols <= 0 || rows <= 0) {
    return false;
  }
  const cx = Math.min(cols - 1, Math.max(0, Math.floor(normX * cols)));
  const cy = Math.min(rows - 1, Math.max(0, Math.floor(normY * rows)));
  const i = cy * cols + cx;
  if (baseboardBinary[i]) {
    return false;
  }
  return labels[i] === wallSemanticIdx;
}

export function filterVerticesToWallMask<T extends { x: number; y: number }>(
  vertices: T[],
  mask: WallMaskSample,
): T[] {
  return vertices.filter(v => isNormPointOnWallMask(v.x, v.y, mask));
}

function isWallPixel(mask: WallMaskSample, x: number, y: number): boolean {
  const { labels, baseboardBinary, cols, rows, wallSemanticIdx } = mask;
  if (x < 0 || y < 0 || x >= cols || y >= rows || wallSemanticIdx < 0) {
    return false;
  }
  const i = y * cols + x;
  if (baseboardBinary[i]) {
    return false;
  }
  return labels[i] === wallSemanticIdx;
}

function isWallBoundaryPixel(mask: WallMaskSample, x: number, y: number): boolean {
  if (!isWallPixel(mask, x, y)) {
    return false;
  }
  const { cols, rows } = mask;
  if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) {
    return true;
  }
  return (
    !isWallPixel(mask, x - 1, y) ||
    !isWallPixel(mask, x + 1, y) ||
    !isWallPixel(mask, x, y - 1) ||
    !isWallPixel(mask, x, y + 1)
  );
}

function isWallCornerBoundaryPixel(
  mask: WallMaskSample,
  x: number,
  y: number,
): boolean {
  if (!isWallBoundaryPixel(mask, x, y)) {
    return false;
  }
  const left = !isWallPixel(mask, x - 1, y);
  const right = !isWallPixel(mask, x + 1, y);
  const up = !isWallPixel(mask, x, y - 1);
  const down = !isWallPixel(mask, x, y + 1);
  return (left || right) && (up || down);
}

/**
 * Snap a normalized point to the nearest wall-mask boundary pixel when the
 * touch falls within `snapRadiusSegPx` (segmentation resolution) of the edge.
 */
export function snapNormPointToWallEdge(
  normX: number,
  normY: number,
  mask: WallMaskSample,
  snapRadiusSegPx = 12,
): { x: number; y: number } {
  const snapped = searchWallSnapTarget(
    normX, normY, mask, snapRadiusSegPx, 'edge',
  );
  return snapped ?? { x: normX, y: normY };
}

/**
 * Prefer wall-mask corner pixels (L-shaped outer boundary), then plain edge.
 * Used when the user taps without dragging.
 */
export function snapNormPointToWallCornerOrEdge(
  normX: number,
  normY: number,
  mask: WallMaskSample,
  snapRadiusSegPx = 16,
): { x: number; y: number } {
  const corner = searchWallSnapTarget(
    normX, normY, mask, snapRadiusSegPx, 'corner',
  );
  if (corner) {
    return corner;
  }
  const edge = searchWallSnapTarget(
    normX, normY, mask, snapRadiusSegPx, 'edge',
  );
  return edge ?? { x: normX, y: normY };
}

/**
 * During vertex drag: snap to corner/edge when near, otherwise keep interior
 * wall points so the anchor can move freely on the wall mask.
 */
export function resolveLassoWallDragPoint(
  normX: number,
  normY: number,
  mask: WallMaskSample,
  snapRadiusSegPx = 12,
): { x: number; y: number } | null {
  const snapped = snapNormPointToWallCornerOrEdge(
    normX, normY, mask, snapRadiusSegPx,
  );
  if (isNormPointOnWallMask(snapped.x, snapped.y, mask)) {
    return snapped;
  }
  if (isNormPointOnWallMask(normX, normY, mask)) {
    return { x: normX, y: normY };
  }
  return null;
}

function searchWallSnapTarget(
  normX: number,
  normY: number,
  mask: WallMaskSample,
  snapRadiusSegPx: number,
  mode: 'corner' | 'edge',
): { x: number; y: number } | null {
  const { cols, rows } = mask;
  if (cols <= 0 || rows <= 0) {
    return null;
  }

  const px = normX * cols;
  const py = normY * rows;
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  const radius = Math.max(1, Math.ceil(snapRadiusSegPx));
  const radiusSq = snapRadiusSegPx * snapRadiusSegPx;

  let bestDistSq = Infinity;
  let bestX = -1;
  let bestY = -1;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) {
        continue;
      }
      const onEdge = isWallBoundaryPixel(mask, x, y);
      if (!onEdge) {
        continue;
      }
      if (mode === 'corner' && !isWallCornerBoundaryPixel(mask, x, y)) {
        continue;
      }
      const distSq = (px - (x + 0.5)) ** 2 + (py - (y + 0.5)) ** 2;
      if (distSq <= radiusSq && distSq < bestDistSq) {
        bestDistSq = distSq;
        bestX = x;
        bestY = y;
      }
    }
  }

  if (bestX < 0) {
    return null;
  }

  return {
    x: (bestX + 0.5) / cols,
    y: (bestY + 0.5) / rows,
  };
}

export function buildWallAllowedMask(
  labels: Uint8Array,
  baseboardBinary: Uint8Array,
  wallSemanticIdx: number,
): Uint8Array | null {
  if (wallSemanticIdx < 0) {
    return null;
  }
  const allowedMask = new Uint8Array(labels.length);
  for (let i = 0; i < labels.length; i++) {
    allowedMask[i] =
      labels[i] === wallSemanticIdx && !baseboardBinary[i] ? 1 : 0;
  }
  return allowedMask;
}

/* ==========================================================================
 * buildEnergyMap
 * ========================================================================== */

const GRAY_R = 0.299;
const GRAY_G = 0.587;
const GRAY_B = 0.114;

/**
 * Build per-pixel energy map from BGR buffer.
 * 1. Convert to grayscale via luminance weights
 * 2. Downsample so longest side ≤ targetMaxSide
 * 3. Apply Sobel 3×3 → gradient magnitude G
 * 4. Energy = 1 / (1 + G), clamped to [0, 1]
 */
export function buildEnergyMap(
  bgrBuffer: Uint8Array,
  cols: number,
  rows: number,
  targetMaxSide = 256,
  allowedMask?: Uint8Array | null,
): EnergyMap {
  const imgLongSide = Math.max(cols, rows);
  const scale = imgLongSide > targetMaxSide ? targetMaxSide / imgLongSide : 1;
  const ew = Math.max(1, Math.floor(cols * scale));
  const eh = Math.max(1, Math.floor(rows * scale));
  const pixelCount = ew * eh;

  // 1. Build grayscale at target resolution (nearest-neighbour downsample)
  const gray = new Float32Array(pixelCount);
  for (let gy = 0; gy < eh; gy++) {
    const sy = Math.min(rows - 1, Math.floor((gy * rows) / eh));
    const rowBase = sy * cols;
    for (let gx = 0; gx < ew; gx++) {
      const sx = Math.min(cols - 1, Math.floor((gx * cols) / ew));
      const i = rowBase + sx;
      const o = (i) * 3;
      const val =
        GRAY_R * bgrBuffer[o + 2] +
        GRAY_G * bgrBuffer[o + 1] +
        GRAY_B * bgrBuffer[o];
      gray[gy * ew + gx] = val;
    }
  }

  // 2. Sobel 3×3 → gradient magnitude
  //   X: [-1 0 1; -2 0 2; -1 0 1]
  //   Y: [-1 -2 -1; 0 0 0; 1 2 1]
  const grad = new Float32Array(pixelCount);
  let maxG = 1; // avoid division by zero

  for (let gy = 1; gy < eh - 1; gy++) {
    for (let gx = 1; gx < ew - 1; gx++) {
      const idx = gy * ew + gx;
      const a = gray[(gy - 1) * ew + (gx - 1)];
      const b = gray[(gy - 1) * ew + gx];
      const c = gray[(gy - 1) * ew + (gx + 1)];
      const d = gray[gy * ew + (gx - 1)];
      const e = gray[gy * ew + gx + 1];
      const f = gray[(gy + 1) * ew + (gx - 1)];
      const gv = gray[(gy + 1) * ew + gx];
      const h = gray[(gy + 1) * ew + (gx + 1)];

      const gxVal = -a + c - 2 * d + 2 * e - f + h;
      const gyVal = -a - 2 * b - c + f + 2 * gv + h;
      const mag = Math.sqrt(gxVal * gxVal + gyVal * gyVal);
      grad[idx] = mag;
      if (mag > maxG) maxG = mag;
    }
  }

  // Boost wall-mask boundary so paths hug the semantic wall edge, not just texture.
  if (allowedMask && allowedMask.length === cols * rows) {
    for (let gy = 0; gy < eh; gy++) {
      for (let gx = 0; gx < ew; gx++) {
        const idx = gy * ew + gx;
        const sx = Math.min(cols - 1, Math.floor((gx * cols) / ew));
        const sy = Math.min(rows - 1, Math.floor((gy * rows) / eh));
        if (!allowedMask[sy * cols + sx]) continue;

        let onBoundary = sx === 0 || sy === 0 || sx === cols - 1 || sy === rows - 1;
        if (!onBoundary) {
          const n1 = allowedMask[sy * cols + (sx - 1)];
          const n2 = allowedMask[sy * cols + (sx + 1)];
          const n3 = allowedMask[(sy - 1) * cols + sx];
          const n4 = allowedMask[(sy + 1) * cols + sx];
          onBoundary = n1 === 0 || n2 === 0 || n3 === 0 || n4 === 0;
        }
        if (onBoundary) {
          grad[idx] = maxG;
        }
      }
    }
  }

  // 3. Energy = 1 / (1 + normalized_gradient); amplify contrast so edges win over interior shortcuts.
  const energy = new Float32Array(pixelCount);
  const traversable =
    allowedMask && allowedMask.length === cols * rows
      ? new Uint8Array(pixelCount)
      : undefined;

  for (let gy = 0; gy < eh; gy++) {
    for (let gx = 0; gx < ew; gx++) {
      const idx = gy * ew + gx;
      const sx = Math.min(cols - 1, Math.floor((gx * cols) / ew));
      const sy = Math.min(rows - 1, Math.floor((gy * rows) / eh));
      const allowed = !allowedMask || allowedMask[sy * cols + sx] > 0;
      if (traversable) {
        traversable[idx] = allowed ? 1 : 0;
      }
      energy[idx] = allowed ? 1.0 / (1.0 + 4.0 * (grad[idx] / maxG)) : 1.0;
    }
  }

  return { map: energy, w: ew, h: eh, scale, traversable };
}

/* ==========================================================================
 * findShortestPath — Dijkstra 8-connected
 * ========================================================================== */

/** 8-connected neighbour offsets (dx, dy) */
const NEIGHBOURS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], /*    */ [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

/** Multiply energy cost so we can use integer priority keys. */
const COST_SCALE = 10000;

/** Binary min-heap for Dijkstra priority queue. */
class MinHeap {
  private data: { idx: number; dist: number }[] = [];

  push(idx: number, dist: number): void {
    this.data.push({ idx, dist });
    this.bubbleUp(this.data.length - 1);
  }

  pop(): { idx: number; dist: number } | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  get length(): number {
    return this.data.length;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].dist <= this.data[i].dist) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left].dist < this.data[smallest].dist) smallest = left;
      if (right < n && this.data[right].dist < this.data[smallest].dist) smallest = right;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

/** Sentry value for "not visited" */
const DIST_INF = 0xffffffff;

/**
 * Dijkstra shortest-path on 8-connected grid.
 * Cost at each pixel = energy[pixel] * COST_SCALE (integer).
 * Diagonal steps cost √2 × the neighbour's energy.
 *
 * Returns ordered path [start, …, end] in energy-map pixel space.
 */
export function findShortestPath(
  energy: Float32Array,
  energyW: number,
  energyH: number,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  traversable?: Uint8Array | null,
): { x: number; y: number }[] {
  // Clamp to valid range
  const clampX = (v: number) => Math.max(1, Math.min(energyW - 2, Math.round(v)));
  const clampY = (v: number) => Math.max(1, Math.min(energyH - 2, Math.round(v)));

  const startX = clampX(sx);
  const startY = clampY(sy);
  const endX = clampX(ex);
  const endY = clampY(ey);

  const pixelCount = energyW * energyH;
  const startIdx = startY * energyW + startX;

  // Distance array (init to infinity)
  const dist = new Uint32Array(pixelCount);
  dist.fill(DIST_INF);
  dist[startIdx] = 0;

  // Previous node for path reconstruction
  const prev = new Int32Array(pixelCount);
  prev.fill(-1);

  const heap = new MinHeap();
  heap.push(startIdx, 0);

  while (heap.length > 0) {
    const node = heap.pop()!;
    const u = node.idx;
    const d = node.dist;
    if (d > dist[u]) continue;

    const ux = u % energyW;
    const uy = Math.floor(u / energyW);

    if (ux === endX && uy === endY) {
      const path: { x: number; y: number }[] = [];
      let cur = u;
      while (cur >= 0) {
        path.push({ x: cur % energyW, y: Math.floor(cur / energyW) });
        cur = prev[cur];
      }
      path.reverse();
      return path;
    }

    for (const [dx, dy] of NEIGHBOURS) {
      const nx = ux + dx;
      const ny = uy + dy;
      if (nx < 0 || nx >= energyW || ny < 0 || ny >= energyH) continue;
      const v = ny * energyW + nx;
      if (traversable && traversable[v] === 0) continue;

      const isDiagonal = dx !== 0 && dy !== 0;
      const stepCost = isDiagonal
        ? Math.round(energy[v] * COST_SCALE * 1.4142)
        : Math.round(energy[v] * COST_SCALE);

      const alt = d + stepCost;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
        heap.push(v, alt);
      }
    }
  }

  // No path found — return straight line
  return [{ x: startX, y: startY }, { x: endX, y: endY }];
}

/* ==========================================================================
 * extractCornerPoints — Douglas-Peucker simplification
 * ========================================================================== */

/**
 * Douglas-Peucker simplification. Keeps points where the perpendicular
 * distance from the line segment exceeds epsilon.
 *
 * After DP, also enforces a minimum distance between consecutive anchors
 * to avoid overly dense clusters.
 */
export function extractCornerPoints(
  path: { x: number; y: number }[],
  minDistance = 8,
  epsilon = 2.0,
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

  // Collect kept points with minDistance filter
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < path.length; i++) {
    if (!keep[i]) continue;
    if (result.length > 0) {
      const last = result[result.length - 1];
      const dist = Math.hypot(path[i].x - last.x, path[i].y - last.y);
      if (dist < minDistance) continue;
    }
    result.push({ x: path[i].x, y: path[i].y });
  }

  return result;
}

/* ==========================================================================
 * upscalePath
 * ========================================================================== */

/** Map normalized image coords (0..1) to energy-map pixel coords. */
export function normToEnergyPoint(
  normX: number,
  normY: number,
  em: EnergyMap,
): { x: number; y: number } {
  return {
    x: Math.min(em.w - 1, Math.max(0, normX * em.w)),
    y: Math.min(em.h - 1, Math.max(0, normY * em.h)),
  };
}

/** Map energy-map pixel coords back to normalized image coords. */
export function energyPointsToNorm(
  points: { x: number; y: number }[],
  em: EnergyMap,
): { x: number; y: number }[] {
  return points.map(p => ({
    x: Math.min(1, Math.max(0, p.x / em.w)),
    y: Math.min(1, Math.max(0, p.y / em.h)),
  }));
}

/** Map energy-map pixel coords back to original image coords. */
export function upscalePath(
  points: { x: number; y: number }[],
  scale: number,
  originW: number,
  originH: number,
): { x: number; y: number }[] {
  return points.map(p => ({
    x: Math.min(originW - 1, Math.max(0, Math.round(p.x / scale))),
    y: Math.min(originH - 1, Math.max(0, Math.round(p.y / scale))),
  }));
}
