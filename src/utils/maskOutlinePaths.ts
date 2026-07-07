import { Skia, type SkPath } from '@shopify/react-native-skia';
import { getMaskSegmentRuntimeConfig } from './maskSegmentRuntime';
import type { SegmentRegion, RegionMaskData } from './maskSegmentation';

/** partition dashed highlight: extract outer contour from the same pixel grid as the fill mask */
type GridPoint = { x: number; y: number };

type GridEdge = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

function isMaskPixelOn(
  binary: Uint8Array,
  cols: number,
  rows: number,
  x: number,
  y: number,
): boolean {
  return (
    x >= 0 && x < cols && y >= 0 && y < rows && binary[y * cols + x] > 0
  );
}

function collectBoundaryEdges(
  binary: Uint8Array,
  cols: number,
  rows: number,
): GridEdge[] {
  const edges: GridEdge[] = [];
  for (let y = 0; y < rows; y++) {
    const row = y * cols;
    for (let x = 0; x < cols; x++) {
      if (!binary[row + x]) {
        continue;
      }
      if (!isMaskPixelOn(binary, cols, rows, x, y - 1)) {
        edges.push({ x0: x, y0: y, x1: x + 1, y1: y });
      }
      if (!isMaskPixelOn(binary, cols, rows, x, y + 1)) {
        edges.push({ x0: x + 1, y0: y + 1, x1: x, y1: y + 1 });
      }
      if (!isMaskPixelOn(binary, cols, rows, x - 1, y)) {
        edges.push({ x0: x, y0: y + 1, x1: x, y1: y });
      }
      if (!isMaskPixelOn(binary, cols, rows, x + 1, y)) {
        edges.push({ x0: x + 1, y0: y, x1: x + 1, y1: y + 1 });
      }
    }
  }
  return edges;
}

function chainBoundaryLoops(edges: GridEdge[]): GridPoint[][] {
  const outgoing = new Map<string, GridEdge[]>();
  const edgeKey = (edge: GridEdge) =>
    `${edge.x0},${edge.y0}->${edge.x1},${edge.y1}`;

  for (const edge of edges) {
    const key = `${edge.x0},${edge.y0}`;
    const list = outgoing.get(key);
    if (list) {
      list.push(edge);
    } else {
      outgoing.set(key, [edge]);
    }
  }

  const used = new Set<string>();
  const loops: GridPoint[][] = [];

  for (const edge of edges) {
    const startEdgeKey = edgeKey(edge);
    if (used.has(startEdgeKey)) {
      continue;
    }

    const loop: GridPoint[] = [{ x: edge.x0, y: edge.y0 }];
    let current = edge;
    used.add(startEdgeKey);
    loop.push({ x: current.x1, y: current.y1 });

    while (true) {
      const endKey = `${current.x1},${current.y1}`;
      const startKey = `${loop[0].x},${loop[0].y}`;
      if (endKey === startKey && loop.length > 2) {
        break;
      }
      const candidates = outgoing.get(endKey);
      const next = candidates?.find(candidate => !used.has(edgeKey(candidate)));
      if (!next) {
        break;
      }
      current = next;
      used.add(edgeKey(current));
      loop.push({ x: current.x1, y: current.y1 });
      if (loop.length > edges.length + 1) {
        break;
      }
    }

    if (loop.length >= 4) {
      loops.push(loop);
    }
  }

  return loops;
}

function simplifyOrthogonalLoop(points: GridPoint[]): GridPoint[] {
  if (points.length <= 3) {
    return points;
  }
  const out: GridPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    const collinearX = prev.x === curr.x && curr.x === next.x;
    const collinearY = prev.y === curr.y && curr.y === next.y;
    if (!collinearX && !collinearY) {
      out.push(curr);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function perpendicularDistance2(
  point: GridPoint,
  lineStart: GridPoint,
  lineEnd: GridPoint,
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }
  const t =
    ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) /
    (dx * dx + dy * dy);
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

/**
 * Ramer-Douglas-Peucker simplification for outline loops.
 * Reduces stair-step jagginess from grid boundary tracing so that dashed
 * outlines render smoothly instead of zigzagging across every pixel edge.
 * Epsilon is in grid-pixel units (1.0 = one mask pixel).
 */
function simplifyLoopRdp(points: GridPoint[], epsilon: number): GridPoint[] {
  if (points.length <= 2) {
    return points;
  }
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  const lineStart = points[0]!;
  const lineEnd = points[end]!;
  for (let i = 1; i < end; i++) {
    const p = points[i]!;
    const dist = perpendicularDistance2(p, lineStart, lineEnd);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyLoopRdp(points.slice(0, index + 1), epsilon);
    const right = simplifyLoopRdp(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [lineStart, lineEnd];
}

function loopsToSkPath(
  loops: GridPoint[][],
  cols: number,
  rows: number,
  rect: { x: number; y: number; w: number; h: number },
): SkPath {
  const path = Skia.Path.Make();
  for (const rawLoop of loops) {
    // Two-pass simplification: first remove collinear points, then RDP to
    // smooth stair-step artifacts from grid boundary tracing.
    const orthogonal = simplifyOrthogonalLoop(rawLoop);
    const loop = simplifyLoopRdp(orthogonal, 1.0);
    if (loop.length < 2) {
      continue;
    }
    const [first, ...rest] = loop;
    path.moveTo(
      rect.x + (first.x / cols) * rect.w,
      rect.y + (first.y / rows) * rect.h,
    );
    for (const point of rest) {
      path.lineTo(
        rect.x + (point.x / cols) * rect.w,
        rect.y + (point.y / rows) * rect.h,
      );
    }
    path.close();
  }
  return path;
}

function pointInIntegerLoop(px: number, py: number, loop: GridPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const xi = loop[i].x;
    const yi = loop[i].y;
    const xj = loop[j].x;
    const yj = loop[j].y;
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

function loopBoundingArea(loop: GridPoint[]): number {
  if (loop.length === 0) {
    return 0;
  }
  let minX = loop[0].x;
  let maxX = loop[0].x;
  let minY = loop[0].y;
  let maxY = loop[0].y;
  for (const point of loop) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return (maxX - minX) * (maxY - minY);
}

function filterOutlineLoops(
  loops: GridPoint[][],
  cols: number,
  rows: number,
  seedPx?: { x: number; y: number },
): GridPoint[][] {
  if (loops.length === 0) {
    return loops;
  }

  const minLoopArea = Math.max(16, Math.floor(cols * rows * 0.00005));
  const significant = loops.filter(
    loop => loopBoundingArea(loop) >= minLoopArea,
  );
  const candidates = significant.length > 0 ? significant : loops;

  if (seedPx) {
    const sampleX = seedPx.x + 0.5;
    const sampleY = seedPx.y + 0.5;
    const containing = candidates.filter(loop =>
      pointInIntegerLoop(sampleX, sampleY, loop),
    );
    if (containing.length > 0) {
      containing.sort((a, b) => loopBoundingArea(b) - loopBoundingArea(a));
      return containing;
    }
  }

  candidates.sort((a, b) => loopBoundingArea(b) - loopBoundingArea(a));
  // Keep loops ≥ 5% of the largest area to filter isolated noise speckles
  // while retaining genuine disconnected fragments of the same region.
  const minKeepArea = loopBoundingArea(candidates[0]!) * 0.05;
  return candidates.filter(loop => loopBoundingArea(loop) >= minKeepArea);
}

export function floodFillComponent(
  binary: Uint8Array,
  cols: number,
  rows: number,
  seedX: number,
  seedY: number,
): Uint8Array | null {
  if (
    seedX < 0 ||
    seedY < 0 ||
    seedX >= cols ||
    seedY >= rows ||
    !binary[seedY * cols + seedX]
  ) {
    return null;
  }

  const out = new Uint8Array(cols * rows);
  const stack = [seedY * cols + seedX];
  out[stack[0]] = 255;

  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % cols;
    const y = (index - x) / cols;

    if (x > 0) {
      const left = index - 1;
      if (binary[left] && !out[left]) {
        out[left] = 255;
        stack.push(left);
      }
    }
    if (x + 1 < cols) {
      const right = index + 1;
      if (binary[right] && !out[right]) {
        out[right] = 255;
        stack.push(right);
      }
    }
    if (y > 0) {
      const up = index - cols;
      if (binary[up] && !out[up]) {
        out[up] = 255;
        stack.push(up);
      }
    }
    if (y + 1 < rows) {
      const down = index + cols;
      if (binary[down] && !out[down]) {
        out[down] = 255;
        stack.push(down);
      }
    }
  }

  return out;
}

function findLargestComponentSeed(
  binary: Uint8Array,
  cols: number,
  rows: number,
): { x: number; y: number } | null {
  const visited = new Uint8Array(cols * rows);
  let bestArea = 0;
  let bestSeed: { x: number; y: number } | null = null;

  for (let y = 0; y < rows; y++) {
    const row = y * cols;
    for (let x = 0; x < cols; x++) {
      const start = row + x;
      if (!binary[start] || visited[start]) {
        continue;
      }

      let area = 0;
      let sumX = 0;
      let sumY = 0;
      const stack = [start];
      visited[start] = 1;

      while (stack.length > 0) {
        const index = stack.pop()!;
        area += 1;
        const px = index % cols;
        const py = (index - px) / cols;
        sumX += px;
        sumY += py;

        if (px > 0) {
          const left = index - 1;
          if (binary[left] && !visited[left]) {
            visited[left] = 1;
            stack.push(left);
          }
        }
        if (px + 1 < cols) {
          const right = index + 1;
          if (binary[right] && !visited[right]) {
            visited[right] = 1;
            stack.push(right);
          }
        }
        if (py > 0) {
          const up = index - cols;
          if (binary[up] && !visited[up]) {
            visited[up] = 1;
            stack.push(up);
          }
        }
        if (py + 1 < rows) {
          const down = index + cols;
          if (binary[down] && !visited[down]) {
            visited[down] = 1;
            stack.push(down);
          }
        }
      }

      if (area > bestArea) {
        bestArea = area;
        bestSeed = {
          x: Math.floor(sumX / area),
          y: Math.floor(sumY / area),
        };
      }
    }
  }

  return bestSeed;
}

function buildRegionOutlinePathFromBinary(
  binary: Uint8Array,
  cols: number,
  rows: number,
  rect: { x: number; y: number; w: number; h: number },
  seedPx?: { x: number; y: number },
): SkPath {
  let working = binary;
  if (seedPx) {
    const component = floodFillComponent(
      binary,
      cols,
      rows,
      seedPx.x,
      seedPx.y,
    );
    if (!component) {
      return Skia.Path.Make();
    }
    working = component;
  }

  const edges = collectBoundaryEdges(working, cols, rows);
  const loops = chainBoundaryLoops(edges);
  const filtered = filterOutlineLoops(loops, cols, rows, seedPx);
  return loopsToSkPath(filtered, cols, rows, rect);
}

function resolveRegionOutlineSeedPx(
  binary: Uint8Array,
  cols: number,
  rows: number,
  normSeed?: { x: number; y: number },
): { x: number; y: number } | undefined {
  if (normSeed) {
    return {
      x: Math.min(cols - 1, Math.max(0, Math.floor(normSeed.x * cols))),
      y: Math.min(rows - 1, Math.max(0, Math.floor(normSeed.y * rows))),
    };
  }
  return findLargestComponentSeed(binary, cols, rows) ?? undefined;
}

export function buildRegionOutlinePathForRegion(
  regionId: number,
  regions: SegmentRegion[],
  maskData: RegionMaskData,
  rect: { x: number; y: number; w: number; h: number },
  normSeed?: { x: number; y: number },
): SkPath {
  const binaries = extractRegionBinaries(regions, maskData);
  const binary = binaries.get(regionId);
  if (!binary) {
    return Skia.Path.Make();
  }

  const { cols, rows } = maskData;
  const seedPx = resolveRegionOutlineSeedPx(binary, cols, rows, normSeed);
  return buildRegionOutlinePathFromBinary(binary, cols, rows, rect, seedPx);
}

function extractRegionBinaries(
  regions: SegmentRegion[],
  maskData: RegionMaskData,
): Map<number, Uint8Array> {
  const { labels, baseboardBinary, cols, rows, wallSubLabels } = maskData;
  const size = cols * rows;
  const binaries = new Map<number, Uint8Array>();
  const semanticColors = getMaskSegmentRuntimeConfig().mask.semanticColors;
  const regionIdBySemantic = new Int32Array(semanticColors.length);
  regionIdBySemantic.fill(-1);
  const wallSubRegionIds = new Map<number, number>();
  let baseboardRegionId: number | null = null;

  for (const reg of regions) {
    binaries.set(reg.id, new Uint8Array(size));
    if (reg.thinStrip) {
      baseboardRegionId = reg.id;
      continue;
    }
    const wallMatch = /^wall-(\d+)$/.exec(reg.name);
    if (wallMatch && wallSubLabels) {
      wallSubRegionIds.set(Number(wallMatch[1]) - 1, reg.id);
      continue;
    }
    const semanticIndex = semanticColors.findIndex(
      entry => entry.name === reg.name,
    );
    if (semanticIndex >= 0) {
      regionIdBySemantic[semanticIndex] = reg.id;
    }
  }

  const semanticCount = semanticColors.length;
  const wallIdx = semanticColors.findIndex(entry => entry.name === 'wall');
  for (let i = 0; i < size; i++) {
    if (baseboardRegionId != null && baseboardBinary[i] > 0) {
      binaries.get(baseboardRegionId)![i] = 255;
      continue;
    }
    if (wallSubLabels && wallIdx >= 0 && labels[i] === wallIdx) {
      const subIdx = wallSubLabels[i];
      if (subIdx !== 255) {
        const regionId = wallSubRegionIds.get(subIdx);
        if (regionId !== undefined) {
          binaries.get(regionId)![i] = 255;
        }
      }
      continue;
    }
    const semanticIndex = labels[i];
    if (semanticIndex < semanticCount && regionIdBySemantic[semanticIndex] >= 0) {
      binaries.get(regionIdBySemantic[semanticIndex])![i] = 255;
    }
  }

  return binaries;
}

export function buildAllRegionOutlinePaths(
  regions: SegmentRegion[],
  maskData: RegionMaskData,
  rect: { x: number; y: number; w: number; h: number },
): Map<number, SkPath> {
  const { cols, rows } = maskData;
  const binaries = extractRegionBinaries(regions, maskData);
  const map = new Map<number, SkPath>();
  for (const reg of regions) {
    const binary = binaries.get(reg.id);
    if (!binary) {
      map.set(reg.id, Skia.Path.Make());
      continue;
    }
    // No seed — build outlines from the full binary so all disconnected
    // fragments (common after mask downsampling) get dashed outlines during
    // the init flash loop. Per-region hold highlights still use a touch-seed
    // via buildRegionOutlinePathForRegion for precise fragment isolation.
    map.set(
      reg.id,
      buildRegionOutlinePathFromBinary(binary, cols, rows, rect),
    );
  }
  return map;
}
