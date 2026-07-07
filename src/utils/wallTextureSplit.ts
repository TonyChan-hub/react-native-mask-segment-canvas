import { bgrToLab } from './freqLayerPrep';
import { getMaskSegmentRuntimeConfig } from './maskSegmentRuntime';
import type { SegmentMaskResult, SegmentRegion } from './maskSegmentation';
import { getSemanticColorByName } from './maskSemanticPalette';

/** Placeholder value for non-wall pixels in wallSubLabels */
export const WALL_SUB_LABEL_NONE = 255;

type WallComponent = {
  label: number;
  area: number;
  bbox: SegmentRegion['bbox'];
};

function maskCfg() {
  return getMaskSegmentRuntimeConfig().mask;
}

type Point = { x: number; y: number };

/** Moore-neighbor boundary tracer on a binary mask component. */
function traceMaskPolygon(
  mask: Uint8Array,
  cols: number,
  rows: number,
): Point[] {
  // Find first non-zero pixel (top-left)
  let startX = -1, startY = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (mask[y * cols + x]) { startX = x; startY = y; break; }
    }
    if (startX >= 0) break;
  }
  if (startX < 0) return [];

  // Moore 8-neighbor clockwise trace
  const dirs: [number, number][] = [
    [1, 0], [1, -1], [0, -1], [-1, -1],
    [-1, 0], [-1, 1], [0, 1], [1, 1],
  ];
  const path: Point[] = [];
  let cx = startX, cy = startY;
  let dir = 7; // start searching from up-left

  for (let i = 0; i < cols * rows; i++) {
    path.push({ x: cx, y: cy });
    let found = false;
    for (let j = 0; j < 8; j++) {
      const d = (dir + 1 + j) % 8; // search clockwise from last direction+1
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (mask[ny * cols + nx]) {
        cx = nx; cy = ny; dir = (d + 4) % 8; // face back toward previous pixel
        found = true;
        break;
      }
    }
    if (!found) break;
    if (path.length > 2 && cx === startX && cy === startY) break;
  }

  return path;
}

/** Douglas-Peucker polygon simplification (epsilon in pixels). */
function simplifyPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const recurse = (s: number, e: number) => {
    if (e - s <= 1) return;
    const dx = points[e].x - points[s].x;
    const dy = points[e].y - points[s].y;
    const lenSq = dx * dx + dy * dy;
    let maxDist = 0, maxIdx = s;
    for (let i = s + 1; i < e; i++) {
      let d: number;
      if (lenSq === 0) {
        d = Math.hypot(points[i].x - points[s].x, points[i].y - points[s].y);
      } else {
        const t = Math.max(0, Math.min(1,
          ((points[i].x - points[s].x) * dx + (points[i].y - points[s].y) * dy) / lenSq,
        ));
        d = Math.hypot(points[i].x - (points[s].x + t * dx), points[i].y - (points[s].y + t * dy));
      }
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > epsilon) { keep[maxIdx] = 1; recurse(s, maxIdx); recurse(maxIdx, e); }
  };
  recurse(0, points.length - 1);

  return points.filter((_, i) => keep[i]);
}

const POLYGON_SIMPLIFY_EPSILON = 2.5;

function computeLabChromaMaps(
  originBgr: Uint8Array,
  cols: number,
  rows: number,
): { aMap: Uint8Array; bMap: Uint8Array } {
  const pixelCount = cols * rows;
  const aMap = new Uint8Array(pixelCount);
  const bMap = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const s = i * 3;
    const lab = bgrToLab(originBgr[s], originBgr[s + 1], originBgr[s + 2]);
    aMap[i] = lab.a;
    bMap[i] = lab.b;
  }
  return { aMap, bMap };
}

/** Per-channel BGR Sobel gradient magnitude. max(B, G, R) for sensitivity to color edges. */
function buildEdgeBarrierMask(
  bgr: Uint8Array,
  cols: number,
  rows: number,
  wallIdx: number,
  labels: Uint8Array,
  baseboardBinary: Uint8Array,
  threshold: number,
): Uint8Array {
  const n = cols * rows;
  const barriers = new Uint8Array(n);
  if (threshold <= 0) return barriers;

  // Per-channel Sobel 3x3 → take max raw gradient.
  // Raw range is [0, ~1442] for 8‑bit BGR. No normalization — a single
  // extremely strong edge (e.g. window frame) would compress all other
  // edges if we normalized relative to maxG.
  const C = cols;

  for (let y = 1; y < rows - 1; y++) {
    const r0 = (y - 1) * C;
    const r1 = y * C;
    const r2 = (y + 1) * C;
    for (let x = 1; x < C - 1; x++) {
      const i = r1 + x;
      if (labels[i] !== wallIdx || baseboardBinary[i]) continue;

      const a0 = r0 + (x - 1), a1 = r0 + x, a2 = r0 + (x + 1);
      const b0 = r1 + (x - 1),             b2 = r1 + (x + 1);
      const c0 = r2 + (x - 1), c1 = r2 + x, c2 = r2 + (x + 1);

      let best = 0;
      for (let ch = 0; ch < 3; ch++) {
        const a = bgr[a0 * 3 + ch];
        const b = bgr[a1 * 3 + ch];
        const c = bgr[a2 * 3 + ch];
        const d = bgr[b0 * 3 + ch];
        const e = bgr[b2 * 3 + ch];
        const f = bgr[c0 * 3 + ch];
        const gv = bgr[c1 * 3 + ch];
        const h = bgr[c2 * 3 + ch];
        const gx = -a + c - 2 * d + 2 * e - f + h;
        const gy = -a - 2 * b - c + f + 2 * gv + h;
        const mag = Math.sqrt(gx * gx + gy * gy);
        if (mag > best) best = mag;
      }
      if (best > threshold) barriers[i] = 1;
    }
  }

  // Dilate 1px to widen the barrier slightly
  return dilateBinary1px(barriers, cols, rows);
}

function dilateBinary1px(src: Uint8Array, cols: number, rows: number): Uint8Array {
  const dst = new Uint8Array(src);
  for (let y = 1; y < rows - 1; y++) {
    const rc = y * cols;
    for (let x = 1; x < cols - 1; x++) {
      const i = rc + x;
      if (src[i]) continue;
      if (
        src[i - 1] || src[i + 1] ||
        src[(y - 1) * cols + x] || src[(y + 1) * cols + x]
      ) {
        dst[i] = 1;
      }
    }
  }
  return dst;
}

function chromaMag(a: number, b: number): number {
  const da = a - 128;
  const db = b - 128;
  return Math.sqrt(da * da + db * db);
}

function chromaDistSq(a0: number, b0: number, a1: number, b1: number): number {
  const da = a0 - a1;
  const db = b0 - b1;
  return da * da + db * db;
}

/** Force a material boundary between white/gray walls and colored walls, or between two different-hue walls */
function isCrossMaterialBoundary(
  a0: number,
  b0: number,
  a1: number,
  b1: number,
  neutralChromaMax: number,
): boolean {
  const m0 = chromaMag(a0, b0);
  const m1 = chromaMag(a1, b1);
  const neutralGate = neutralChromaMax * 2.2;

  if (m0 <= neutralChromaMax && m1 > neutralGate) return true;
  if (m1 <= neutralChromaMax && m0 > neutralGate) return true;

  if (m0 > neutralChromaMax && m1 > neutralChromaMax) {
    const hue0 = Math.atan2(b0 - 128, a0 - 128);
    const hue1 = Math.atan2(b1 - 128, a1 - 128);
    let dh = Math.abs(hue0 - hue1);
    if (dh > Math.PI) dh = 2 * Math.PI - dh;
    if (dh > Math.PI / 4) return true;
  }

  return false;
}

function canMergeWallPixels(
  refA: number,
  refB: number,
  na: number,
  nb: number,
  distSqThreshold: number,
  neutralChromaMax: number,
): boolean {
  if (isCrossMaterialBoundary(refA, refB, na, nb, neutralChromaMax)) {
    return false;
  }
  return chromaDistSq(refA, refB, na, nb) <= distSqThreshold;
}

function findWallSemanticIndex(): number {
  const colors = maskCfg().semanticColors;
  return colors.findIndex(entry => entry.name === 'wall');
}

function isWallPixel(
  labels: Uint8Array,
  baseboardBinary: Uint8Array,
  wallIdx: number,
  i: number,
): boolean {
  if (baseboardBinary[i]) return false;
  return labels[i] === wallIdx;
}

/**
 * Morphological close on the wall mask: dilate then erode to fill small
 * non-wall holes (windows, doors, occlusions) that would otherwise
 * fragment a single wall into disconnected components during BFS.
 * Returns a temporary labels array with holes filled as wallIdx.
 */
function closeWallMask(
  labels: Uint8Array,
  baseboardBinary: Uint8Array,
  wallIdx: number,
  cols: number,
  rows: number,
  radius: number,
): { labels: Uint8Array; baseboardBinary: Uint8Array } {
  const n = cols * rows;

  // Binary wall mask
  const bin = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (labels[i] === wallIdx && !baseboardBinary[i]) bin[i] = 1;
  }

  // Dilate N times
  let dilated = bin;
  for (let pass = 0; pass < radius; pass++) {
    dilated = dilateBinary1px(dilated, cols, rows);
  }

  // Erode N times
  let closed = dilated;
  for (let pass = 0; pass < radius; pass++) {
    closed = erodeBinary1px(closed, cols, rows);
  }

  // Build closed labels: pixels that were NOT wall but are now in the closed
  // mask get wallIdx so the BFS can cross them. Original non-wall pixels
  // outside the wall area are unchanged.
  const closedLabels = new Uint8Array(labels);
  for (let i = 0; i < n; i++) {
    if (closed[i] && labels[i] !== wallIdx && !baseboardBinary[i]) {
      closedLabels[i] = wallIdx;
    }
  }

  // These pixels were baseboard or other semantic — keep them excluded
  const closedBaseboard = new Uint8Array(baseboardBinary);
  for (let i = 0; i < n; i++) {
    if (closed[i] && labels[i] !== wallIdx && baseboardBinary[i]) {
      // Baseboard inside the closed area: treat as wall so it doesn't block BFS
      closedLabels[i] = wallIdx;
      closedBaseboard[i] = 0;
    }
  }

  return { labels: closedLabels, baseboardBinary: closedBaseboard };
}

function erodeBinary1px(src: Uint8Array, cols: number, rows: number): Uint8Array {
  const dst = new Uint8Array(src);
  for (let y = 1; y < rows - 1; y++) {
    const rc = y * cols;
    for (let x = 1; x < cols - 1; x++) {
      const i = rc + x;
      if (!src[i]) continue;
      if (
        !src[rc + (x - 1)] || !src[rc + (x + 1)] ||
        !src[(y - 1) * cols + x] || !src[(y + 1) * cols + x]
      ) {
        dst[i] = 0;
      }
    }
  }
  return dst;
}

/**
 * 4-connected component growth: compares against component chroma mean to avoid chain bridging;
 * forces separation at neutral/colored wall boundaries.
 */
function labelWallComponents(
  labels: Uint8Array,
  baseboardBinary: Uint8Array,
  wallIdx: number,
  aMap: Uint8Array,
  bMap: Uint8Array,
  barrierMask: Uint8Array,
  cols: number,
  rows: number,
  distSqThreshold: number,
  neutralChromaMax: number,
): { compLabels: Int32Array; compCount: number } {
  const pixelCount = cols * rows;
  const compLabels = new Int32Array(pixelCount);
  compLabels.fill(-1);
  let compCount = 0;

  const queue = new Int32Array(pixelCount);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!isWallPixel(labels, baseboardBinary, wallIdx, i)) continue;
      if (compLabels[i] >= 0) continue;

      const compId = compCount;
      compCount += 1;

      const seedA = aMap[i];
      const seedB = bMap[i];
      let sumA = seedA;
      let sumB = seedB;
      let count = 1;

      let head = 0;
      let tail = 0;
      queue[tail++] = i;
      compLabels[i] = compId;

      while (head < tail) {
        const ci = queue[head++];
        const cx = ci % cols;
        const cy = (ci / cols) | 0;
        const meanA = sumA / count;
        const meanB = sumB / count;

        const neighbors = [ci - 1, ci + 1, ci - cols, ci + cols];
        for (const ni of neighbors) {
          if (ni < 0 || ni >= pixelCount) continue;
          const nx = ni % cols;
          if (Math.abs(nx - cx) > 1) continue;
          if (!isWallPixel(labels, baseboardBinary, wallIdx, ni)) continue;
          if (barrierMask[ni]) continue;
          if (compLabels[ni] >= 0) continue;

          const na = aMap[ni];
          const nb = bMap[ni];
          const stepOk = canMergeWallPixels(
            aMap[ci],
            bMap[ci],
            na,
            nb,
            distSqThreshold * 1.8,
            neutralChromaMax,
          );
          const meanOk = canMergeWallPixels(
            meanA,
            meanB,
            na,
            nb,
            distSqThreshold,
            neutralChromaMax,
          );
          const seedOk = canMergeWallPixels(
            seedA,
            seedB,
            na,
            nb,
            distSqThreshold * 3,
            neutralChromaMax,
          );
          if (!stepOk || !meanOk || !seedOk) {
            continue;
          }

          compLabels[ni] = compId;
          sumA += na;
          sumB += nb;
          count += 1;
          queue[tail++] = ni;
        }
      }
    }
  }

  return { compLabels, compCount };
}

function computeComponentStats(
  compLabels: Int32Array,
  compCount: number,
  cols: number,
  rows: number,
): WallComponent[] {
  const stats: WallComponent[] = Array.from({ length: compCount }, (_, label) => ({
    label,
    area: 0,
    bbox: { x: cols, y: rows, w: 0, h: 0 },
  }));

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const comp = compLabels[i];
      if (comp < 0) continue;
      const s = stats[comp];
      s.area += 1;
      if (x < s.bbox.x) s.bbox.x = x;
      if (y < s.bbox.y) s.bbox.y = y;
      const right = x + 1;
      const bottom = y + 1;
      if (right > s.bbox.x + s.bbox.w) s.bbox.w = right - s.bbox.x;
      if (bottom > s.bbox.y + s.bbox.h) s.bbox.h = bottom - s.bbox.y;
    }
  }

  return stats;
}

function computeComponentChromaMeans(
  compLabels: Int32Array,
  aMap: Uint8Array,
  bMap: Uint8Array,
  compCount: number,
  cols: number,
  rows: number,
): { meanA: Float64Array; meanB: Float64Array } {
  const sumA = new Float64Array(compCount);
  const sumB = new Float64Array(compCount);
  const counts = new Float64Array(compCount);
  const pixelCount = cols * rows;

  for (let i = 0; i < pixelCount; i++) {
    const comp = compLabels[i];
    if (comp < 0) continue;
    sumA[comp] += aMap[i];
    sumB[comp] += bMap[i];
    counts[comp] += 1;
  }

  const meanA = new Float64Array(compCount);
  const meanB = new Float64Array(compCount);
  for (let c = 0; c < compCount; c++) {
    if (counts[c] > 0) {
      meanA[c] = sumA[c] / counts[c];
      meanB[c] = sumB[c] / counts[c];
    } else {
      meanA[c] = 128;
      meanB[c] = 128;
    }
  }
  return { meanA, meanB };
}

function mergeSmallComponents(
  compLabels: Int32Array,
  stats: WallComponent[],
  aMap: Uint8Array,
  bMap: Uint8Array,
  cols: number,
  rows: number,
  minArea: number,
  distSqThreshold: number,
  neutralChromaMax: number,
): void {
  const compCount = stats.length;
  const { meanA, meanB } = computeComponentChromaMeans(
    compLabels,
    aMap,
    bMap,
    compCount,
    cols,
    rows,
  );
  const adjacency = new Map<number, Map<number, number>>();

  const addEdge = (a: number, b: number) => {
    if (a === b || a < 0 || b < 0) return;
    let map = adjacency.get(a);
    if (!map) {
      map = new Map();
      adjacency.set(a, map);
    }
    map.set(b, (map.get(b) ?? 0) + 1);
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const a = compLabels[i];
      if (a < 0) continue;
      if (x + 1 < cols) {
        const b = compLabels[i + 1];
        if (b >= 0) addEdge(a, b);
      }
      if (y + 1 < rows) {
        const b = compLabels[i + cols];
        if (b >= 0) addEdge(a, b);
      }
    }
  }

  const remap = new Int32Array(compCount);
  for (let i = 0; i < compCount; i++) remap[i] = i;

  const find = (x: number): number => {
    while (remap[x] !== x) {
      remap[x] = remap[remap[x]];
      x = remap[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    const areaA = stats[ra].area;
    const areaB = stats[rb].area;
    if (areaA >= areaB) {
      remap[rb] = ra;
      stats[ra].area += stats[rb].area;
      stats[rb].area = 0;
    } else {
      remap[ra] = rb;
      stats[rb].area += stats[ra].area;
      stats[ra].area = 0;
    }
  };

  for (let c = 0; c < compCount; c++) {
    if (stats[c].area >= minArea) continue;
    const neighbors = adjacency.get(c);
    if (!neighbors || neighbors.size === 0) continue;
    let bestNeighbor = -1;
    let bestBorder = 0;
    for (const [nb, border] of neighbors) {
      if (border > bestBorder) {
        bestBorder = border;
        bestNeighbor = nb;
      }
    }
    if (bestNeighbor >= 0) {
      if (
        !canMergeWallPixels(
          meanA[c],
          meanB[c],
          meanA[bestNeighbor],
          meanB[bestNeighbor],
          distSqThreshold,
          neutralChromaMax,
        )
      ) {
        continue;
      }
      union(c, bestNeighbor);
    }
  }

  // Second pass: any component that is smaller than its most-adjacent
  // neighbor is almost certainly a barrier artefact — merge it.
  for (let c = 0; c < compCount; c++) {
    if (stats[c].area <= 0) continue;
    const neighbors = adjacency.get(c);
    if (!neighbors || neighbors.size === 0) continue;
    let bestNeighbor = -1;
    let bestBorder = 0;
    for (const [nb, border] of neighbors) {
      if (border > bestBorder) {
        bestBorder = border;
        bestNeighbor = nb;
      }
    }
    if (bestNeighbor < 0) continue;
    if (stats[c].area >= stats[bestNeighbor].area) continue;
    union(c, bestNeighbor);
  }

  const pixelCount = cols * rows;
  for (let i = 0; i < pixelCount; i++) {
    const c = compLabels[i];
    if (c < 0) continue;
    compLabels[i] = find(c);
  }
}

/**
 * Fresh-adjacency pass: rebuild the adjacency graph from current labels and
 * merge every component below minArea into its most-adjacent larger neighbor.
 * Runs until all tiny fragments are absorbed or no more merges possible.
 */
function mergeFreshTinyComponents(
  compLabels: Int32Array,
  stats: WallComponent[],
  cols: number,
  rows: number,
  minArea: number,
): void {
  const compCount = stats.length;
  // Build adjacency from current labels
  const adjacency = new Map<number, Map<number, number>>();
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    let m = adjacency.get(a);
    if (!m) { m = new Map(); adjacency.set(a, m); }
    m.set(b, (m.get(b) ?? 0) + 1);
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const a = compLabels[i];
      if (a < 0) continue;
      if (x + 1 < cols) { const b = compLabels[i + 1]; if (b >= 0) addEdge(a, b); }
      if (y + 1 < rows) { const b = compLabels[i + cols]; if (b >= 0) addEdge(a, b); }
    }
  }

  const remap = new Int32Array(compCount);
  for (let i = 0; i < compCount; i++) remap[i] = i;
  const find = (x: number): number => {
    while (remap[x] !== x) { remap[x] = remap[remap[x]]; x = remap[x]; }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if (stats[ra].area >= stats[rb].area) {
      remap[rb] = ra; stats[ra].area += stats[rb].area; stats[rb].area = 0;
    } else {
      remap[ra] = rb; stats[rb].area += stats[ra].area; stats[ra].area = 0;
    }
  };

  for (let iter = 0; iter < compCount; iter++) {
    let changed = false;
    for (let c = 0; c < compCount; c++) {
      if (stats[c].area <= 0 || stats[c].area >= minArea) continue;
      const nbrs = adjacency.get(c);
      if (!nbrs || nbrs.size === 0) continue;
      let bestNb = -1, bestBorder = 0;
      for (const [nb, border] of nbrs) {
        if (remap[nb] !== nb) continue;
        if (border > bestBorder) { bestBorder = border; bestNb = nb; }
      }
      if (bestNb < 0) continue;
      union(c, bestNb);
      changed = true;
    }
    if (!changed) break;
  }

  const n = cols * rows;
  for (let i = 0; i < n; i++) {
    const c = compLabels[i];
    if (c >= 0) compLabels[i] = find(c);
  }
}

function relabelComponentsContiguous(
  compLabels: Int32Array,
  cols: number,
  rows: number,
): { labels: Int32Array; compCount: number; stats: WallComponent[] } {
  const pixelCount = cols * rows;
  const remap = new Map<number, number>();
  const out = new Int32Array(pixelCount);
  out.fill(-1);

  for (let i = 0; i < pixelCount; i++) {
    const c = compLabels[i];
    if (c < 0) continue;
    let next = remap.get(c);
    if (next === undefined) {
      next = remap.size;
      remap.set(c, next);
    }
    out[i] = next;
  }

  const compCount = remap.size;
  const stats = computeComponentStats(out, compCount, cols, rows);
  return { labels: out, compCount, stats };
}

export function buildPickMapAfterWallSplit(
  labels: Uint8Array,
  baseboardBinary: Uint8Array,
  wallIdx: number,
  wallSubLabels: Uint8Array,
  indexToName: string[],
  nameToId: Map<string, number>,
  cols: number,
  rows: number,
): Uint8Array {
  const pixelCount = cols * rows;
  const pick = new Uint8Array(pixelCount);
  const baseboardName = 'baseboard';
  const baseboardId = nameToId.get(baseboardName);
  const baseboardCode = baseboardId === undefined ? 0 : baseboardId + 1;

  for (let i = 0; i < pixelCount; i++) {
    if (baseboardBinary[i]) {
      if (baseboardCode > 0) {
        pick[i] = baseboardCode;
      }
      continue;
    }

    if (wallIdx >= 0 && labels[i] === wallIdx) {
      if (wallSubLabels[i] !== WALL_SUB_LABEL_NONE) {
        const wallName = `wall-${wallSubLabels[i] + 1}`;
        const regionId = nameToId.get(wallName);
        if (regionId !== undefined) {
          pick[i] = regionId + 1;
        }
      }
      // Unpartitioned wall pixels stay 0 (no parent "wall" region after manual split).
      continue;
    }

    const semanticIndex = labels[i];
    if (semanticIndex === 255) continue;
    const name = indexToName[semanticIndex];
    if (!name) continue;
    const regionId = nameToId.get(name);
    if (regionId !== undefined) {
      pick[i] = regionId + 1;
    }
  }

  return pick;
}

/**
 * Manual lasso split: copy the existing pick map and rewrite wall pixels only.
 * Non-wall pick codes stay identical so prior paints and hit-testing remain stable.
 */
export function patchPickMapForManualWallSplit(
  existingPick: Uint8Array,
  labels: Uint8Array,
  baseboardBinary: Uint8Array,
  wallIdx: number,
  wallSubLabels: Uint8Array,
  nameToId: Map<string, number>,
  cols: number,
  rows: number,
): Uint8Array {
  const pixelCount = cols * rows;
  const pick = new Uint8Array(existingPick);

  if (wallIdx < 0) {
    return pick;
  }

  for (let i = 0; i < pixelCount; i++) {
    if (baseboardBinary[i]) {
      continue;
    }
    if (labels[i] !== wallIdx) {
      continue;
    }

    const sub = wallSubLabels[i];
    if (sub === WALL_SUB_LABEL_NONE) {
      pick[i] = 0;
      continue;
    }

    const wallName = `wall-${sub + 1}`;
    const regionId = nameToId.get(wallName);
    pick[i] = regionId !== undefined ? regionId + 1 : 0;
  }

  return pick;
}

export function dilatePickBuffer1px(
  pick: Uint8Array,
  cols: number,
  rows: number,
): Uint8Array {
  const pixelCount = cols * rows;
  const dst = new Uint8Array(pixelCount);
  dst.set(pick);

  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      if (pick[i] !== 0) continue;

      const n = [
        pick[(y - 1) * cols + (x - 1)],
        pick[(y - 1) * cols + x],
        pick[(y - 1) * cols + (x + 1)],
        pick[y * cols + (x - 1)],
        pick[y * cols + (x + 1)],
        pick[(y + 1) * cols + (x - 1)],
        pick[(y + 1) * cols + x],
        pick[(y + 1) * cols + (x + 1)],
      ];

      const counts: Record<number, number> = {};
      for (let k = 0; k < 8; k++) {
        const code = n[k];
        if (code !== 0) {
          counts[code] = (counts[code] ?? 0) + 1;
        }
      }

      for (const codeStr of Object.keys(counts)) {
        const code = Number(codeStr);
        if (counts[code] >= 4) {
          dst[i] = code;
          break;
        }
      }
    }
  }

  return dst;
}

const GAP_ABSORB_NEIGHBOURS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], /*    */ [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export type LassoPolyBBox = { x: number; y: number; w: number; h: number };

function expandLassoPolyBBox(b: LassoPolyBBox, x: number, y: number): void {
  if (b.w === 0 && b.h === 0) {
    b.x = x;
    b.y = y;
    b.w = 1;
    b.h = 1;
    return;
  }
  const right = b.x + b.w;
  const bottom = b.y + b.h;
  if (x < b.x) {
    b.w = right - x;
    b.x = x;
  } else if (x + 1 > right) {
    b.w = x + 1 - b.x;
  }
  if (y < b.y) {
    b.h = bottom - y;
    b.y = y;
  } else if (y + 1 > bottom) {
    b.h = y + 1 - b.y;
  }
}

function recomputeLassoPolyStats(
  polyLabels: Uint8Array,
  polyCount: number,
  cols: number,
  rows: number,
  areas: number[],
  bboxes: LassoPolyBBox[],
): void {
  areas.fill(0);
  for (let pi = 0; pi < polyCount; pi++) {
    bboxes[pi] = { x: cols, y: rows, w: 0, h: 0 };
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const pi = polyLabels[i];
      if (pi === WALL_SUB_LABEL_NONE || pi >= polyCount) {
        continue;
      }
      areas[pi]++;
      expandLassoPolyBBox(bboxes[pi], x, y);
    }
  }
}

/**
 * Morphologically dilate each lasso polygon into adjacent unassigned wall pixels
 * (up to `dilateRadius` seg pixels) so thin gaps against the wall mask merge in.
 */
export function absorbSmallWallGapsForLassoPolygons(
  polyLabels: Uint8Array,
  polyCount: number,
  areas: number[],
  bboxes: LassoPolyBBox[],
  labels: Uint8Array,
  baseboardBinary: Uint8Array,
  wallSemanticIdx: number,
  priorAssignedLabels: Uint8Array,
  cols: number,
  rows: number,
  dilateRadius: number,
): void {
  if (
    polyCount <= 0 ||
    dilateRadius <= 0 ||
    wallSemanticIdx < 0
  ) {
    return;
  }

  const isExpandable = (i: number): boolean => {
    if (labels[i] !== wallSemanticIdx) return false;
    if (baseboardBinary[i]) return false;
    if (priorAssignedLabels[i] !== WALL_SUB_LABEL_NONE) return false;
    return polyLabels[i] === WALL_SUB_LABEL_NONE;
  };

  for (let polyIdx = 0; polyIdx < polyCount; polyIdx++) {
    for (let pass = 0; pass < dilateRadius; pass++) {
      const toAdd: number[] = [];

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          if (polyLabels[i] !== polyIdx) continue;

          for (const [dx, dy] of GAP_ABSORB_NEIGHBOURS) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
            const ni = ny * cols + nx;
            if (isExpandable(ni)) {
              toAdd.push(ni);
            }
          }
        }
      }

      if (toAdd.length === 0) {
        break;
      }

      for (const ni of toAdd) {
        polyLabels[ni] = polyIdx;
      }
    }
  }

  recomputeLassoPolyStats(polyLabels, polyCount, cols, rows, areas, bboxes);
}

/**
 * After semantic segmentation, subdivide the wall region into wall-1, wall-2… by source image texture features
 */
export function splitWallRegionsByTexture(
  result: SegmentMaskResult,
  originBgr: Uint8Array,
  cols: number,
  rows: number,
  minArea: number,
): SegmentMaskResult {
  const cfg = maskCfg();
  if (!cfg.splitWalls) {
    return result;
  }

  const wallRegion = result.regions.find(reg => reg.name === 'wall');
  if (!wallRegion) {
    return result;
  }

  const wallIdx = findWallSemanticIndex();
  if (wallIdx < 0) {
    return result;
  }

  const { labels, baseboardBinary, regions } = result;
  const pixelCount = cols * rows;
  if (originBgr.length < pixelCount * 3) {
    return result;
  }

  // Close small mask holes so non-wall pixels (windows, doors) don't
  // fragment a single wall into disconnected BFS components.
  const closeRadius = cfg.splitWallsCloseMaskRadius ?? 3;
  const closed = closeRadius > 0
    ? closeWallMask(labels, baseboardBinary, wallIdx, cols, rows, closeRadius)
    : { labels, baseboardBinary };
  const bfsLabels = closed.labels;
  const bfsBaseboard = closed.baseboardBinary;

  const { aMap: rawA, bMap: rawB } = computeLabChromaMaps(originBgr, cols, rows);
  const barrierMask = buildEdgeBarrierMask(
    originBgr, cols, rows, wallIdx, bfsLabels, bfsBaseboard,
    cfg.splitWallsEdgeBarrierThreshold ?? 36,
  );
  const distSqThreshold = cfg.splitWallsColorDistSq;
  const neutralChromaMax = cfg.splitWallsNeutralChromaMax;
  const minAreaFloor = Math.max(
    minArea,
    Math.floor(cols * rows * cfg.splitWallsMinAreaRatio),
  );

  const { compLabels: rawCompLabels, compCount: rawCount } = labelWallComponents(
    bfsLabels,
    bfsBaseboard,
    wallIdx,
    rawA,
    rawB,
    barrierMask,
    cols,
    rows,
    distSqThreshold,
    neutralChromaMax,
  );

  if (rawCount === 0) {
    return result;
  }

  let stats = computeComponentStats(rawCompLabels, rawCount, cols, rows);
  mergeSmallComponents(
    rawCompLabels,
    stats,
    rawA,
    rawB,
    cols,
    rows,
    minAreaFloor,
    distSqThreshold,
    neutralChromaMax,
  );

  let finalCompLabels: Int32Array;
  let compCount: number;
  let finalStats: WallComponent[];

  {
    const relabeled = relabelComponentsContiguous(rawCompLabels, cols, rows);
    mergeFreshTinyComponents(relabeled.labels, relabeled.stats, cols, rows, minAreaFloor);
    const final = relabelComponentsContiguous(relabeled.labels, cols, rows);
    finalCompLabels = final.labels;
    compCount = final.compCount;
    finalStats = final.stats;
  }

  if (compCount === 0) {
    return result;
  }

  // Sort by area descending, truncate to maxCount
  const ranked = finalStats
    .map((s, idx) => ({ ...s, origIdx: idx }))
    .filter(s => s.area > 0)
    .sort((a, b) => b.area - a.area)
    .slice(0, cfg.splitWallsMaxCount);

  const rankMap = new Map<number, number>();
  ranked.forEach((s, rank) => {
    rankMap.set(s.origIdx, rank);
  });

  const wallSubLabels = new Uint8Array(pixelCount);
  wallSubLabels.fill(WALL_SUB_LABEL_NONE);

  for (let i = 0; i < pixelCount; i++) {
    const c = finalCompLabels[i];
    if (c < 0) continue;
    const rank = rankMap.get(c);
    if (rank === undefined) continue;
    wallSubLabels[i] = rank;
  }

  const wallRef = getSemanticColorByName('wall');
  const wallHex = wallRef?.hex ?? wallRegion.hex;
  const wallColor = wallRef?.bgr ?? wallRegion.color;

  // Build per-component binary masks and trace simplified polygons
  const compMasks = new Array<Uint8Array>(ranked.length);
  for (let i = 0; i < pixelCount; i++) {
    const c = finalCompLabels[i];
    if (c < 0) continue;
    const rank = rankMap.get(c);
    if (rank === undefined) continue;
    if (!compMasks[rank]) compMasks[rank] = new Uint8Array(pixelCount);
    compMasks[rank][i] = 1;
  }

  const nonWallRegions = regions.filter(reg => reg.name !== 'wall');
  const wallSubRegions: SegmentRegion[] = ranked.map((s, rank) => {
    const mask = compMasks[rank];
    const rawPoly = mask ? traceMaskPolygon(mask, cols, rows) : [];
    const poly = simplifyPolygon(rawPoly, POLYGON_SIMPLIFY_EPSILON);
    // Fallback to bbox if contour tracing failed
    const fallback = poly.length >= 3 ? poly : [
      { x: s.bbox.x, y: s.bbox.y },
      { x: s.bbox.x + s.bbox.w, y: s.bbox.y },
      { x: s.bbox.x + s.bbox.w, y: s.bbox.y + s.bbox.h },
      { x: s.bbox.x, y: s.bbox.y + s.bbox.h },
    ];
    return {
      id: 0,
      name: `wall-${rank + 1}`,
      hex: wallHex,
      color: { ...wallColor },
      polygons: [fallback],
      outlinePolygons: [fallback],
      bbox: s.bbox,
      area: s.area,
    };
  });

  const mergedRegions = [...nonWallRegions, ...wallSubRegions];
  mergedRegions.sort((a, b) => b.area - a.area);
  mergedRegions.forEach((reg, index) => {
    reg.id = index;
  });

  const nameToId = new Map(mergedRegions.map(reg => [reg.name, reg.id]));
  const indexToName = cfg.semanticColors.map(entry => entry.name);

  const pickRaw = buildPickMapAfterWallSplit(
    labels,
    baseboardBinary,
    wallIdx,
    wallSubLabels,
    indexToName,
    nameToId,
    cols,
    rows,
  );
  const pickBuffer = dilatePickBuffer1px(pickRaw, cols, rows);

  for (const reg of mergedRegions) {
    if (!/^wall-\d+$/.test(reg.name)) continue;
    const subIdx = Number(reg.name.slice(5)) - 1;
    let area = 0;
    for (let i = 0; i < pixelCount; i++) {
      if (wallSubLabels[i] === subIdx) area += 1;
    }
    reg.area = area;
  }

  return {
    regions: mergedRegions,
    pickMap: { buffer: pickBuffer, cols, rows },
    labels,
    baseboardBinary,
    segCols: cols,
    segRows: rows,
    wallSubLabels,
  };
}

export function isWallSubRegionName(name: string): boolean {
  return /^wall-\d+$/.test(name);
}
