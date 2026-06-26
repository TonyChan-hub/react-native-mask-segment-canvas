import cv from './opencvAdapter';
import { Skia } from '@shopify/react-native-skia';
import { BASEBOARD_SEMANTIC_NAME, classifyBgrPixelToSemantic, getCabinetQuantKeys, getSemanticColorByName, getWallQuantKeys, getBaseboardStripQuantKeys, isStrictBaseboardPixel, } from './maskSemanticPalette';
import { getMaskRuntimeRevision, getMaskSegmentRuntimeConfig } from './maskSegmentRuntime';
function maskCfg() {
    return getMaskSegmentRuntimeConfig().mask;
}
const MORPH_KERNEL_SIZE = 5;
const MAX_DASH_OUTLINE_POLYGONS = 10;
function bboxToPolygon(bbox) {
    return [
        { x: bbox.x, y: bbox.y },
        { x: bbox.x + bbox.w, y: bbox.y },
        { x: bbox.x + bbox.w, y: bbox.y + bbox.h },
        { x: bbox.x, y: bbox.y + bbox.h },
    ];
}
export function buildRegionOutlinePolygons(reg) {
    if (reg.outlinePolygons && reg.outlinePolygons.length > 0) {
        return reg.outlinePolygons;
    }
    if (reg.thinStrip || reg.polygons.length <= MAX_DASH_OUTLINE_POLYGONS) {
        return reg.polygons;
    }
    return [bboxToPolygon(reg.bbox)];
}
function isMaskPixelOn(binary, cols, rows, x, y) {
    return (x >= 0 && x < cols && y >= 0 && y < rows && binary[y * cols + x] > 0);
}
function collectBoundaryEdges(binary, cols, rows) {
    const edges = [];
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
function chainBoundaryLoops(edges) {
    const outgoing = new Map();
    const edgeKey = (edge) => `${edge.x0},${edge.y0}->${edge.x1},${edge.y1}`;
    for (const edge of edges) {
        const key = `${edge.x0},${edge.y0}`;
        const list = outgoing.get(key);
        if (list) {
            list.push(edge);
        }
        else {
            outgoing.set(key, [edge]);
        }
    }
    const used = new Set();
    const loops = [];
    for (const edge of edges) {
        const startEdgeKey = edgeKey(edge);
        if (used.has(startEdgeKey)) {
            continue;
        }
        const loop = [{ x: edge.x0, y: edge.y0 }];
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
function simplifyOrthogonalLoop(points) {
    if (points.length <= 3) {
        return points;
    }
    const out = [points[0]];
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
function perpendicularDistance2(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    if (dx === 0 && dy === 0) {
        return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
    }
    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) /
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
function simplifyLoopRdp(points, epsilon) {
    if (points.length <= 2) {
        return points;
    }
    let maxDist = 0;
    let index = 0;
    const end = points.length - 1;
    const lineStart = points[0];
    const lineEnd = points[end];
    for (let i = 1; i < end; i++) {
        const p = points[i];
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
function loopsToSkPath(loops, cols, rows, rect) {
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
        path.moveTo(rect.x + (first.x / cols) * rect.w, rect.y + (first.y / rows) * rect.h);
        for (const point of rest) {
            path.lineTo(rect.x + (point.x / cols) * rect.w, rect.y + (point.y / rows) * rect.h);
        }
        path.close();
    }
    return path;
}
function pointInIntegerLoop(px, py, loop) {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const xi = loop[i].x;
        const yi = loop[i].y;
        const xj = loop[j].x;
        const yj = loop[j].y;
        const intersect = yi > py !== yj > py &&
            px < ((xj - xi) * (py - yi)) / (yj - yi + Number.EPSILON) + xi;
        if (intersect) {
            inside = !inside;
        }
    }
    return inside;
}
function loopBoundingArea(loop) {
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
function filterOutlineLoops(loops, cols, rows, seedPx) {
    if (loops.length === 0) {
        return loops;
    }
    const minLoopArea = Math.max(16, Math.floor(cols * rows * 0.00005));
    const significant = loops.filter(loop => loopBoundingArea(loop) >= minLoopArea);
    const candidates = significant.length > 0 ? significant : loops;
    if (seedPx) {
        const sampleX = seedPx.x + 0.5;
        const sampleY = seedPx.y + 0.5;
        const containing = candidates.filter(loop => pointInIntegerLoop(sampleX, sampleY, loop));
        if (containing.length > 0) {
            containing.sort((a, b) => loopBoundingArea(b) - loopBoundingArea(a));
            return containing;
        }
    }
    candidates.sort((a, b) => loopBoundingArea(b) - loopBoundingArea(a));
    // Keep loops ≥ 5% of the largest area to filter isolated noise speckles
    // while retaining genuine disconnected fragments of the same region.
    const minKeepArea = loopBoundingArea(candidates[0]) * 0.05;
    return candidates.filter(loop => loopBoundingArea(loop) >= minKeepArea);
}
function floodFillComponent(binary, cols, rows, seedX, seedY) {
    if (seedX < 0 ||
        seedY < 0 ||
        seedX >= cols ||
        seedY >= rows ||
        !binary[seedY * cols + seedX]) {
        return null;
    }
    const out = new Uint8Array(cols * rows);
    const stack = [seedY * cols + seedX];
    out[stack[0]] = 255;
    while (stack.length > 0) {
        const index = stack.pop();
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
function findLargestComponentSeed(binary, cols, rows) {
    const visited = new Uint8Array(cols * rows);
    let bestArea = 0;
    let bestSeed = null;
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
                const index = stack.pop();
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
function buildRegionOutlinePathFromBinary(binary, cols, rows, rect, seedPx) {
    let working = binary;
    if (seedPx) {
        const component = floodFillComponent(binary, cols, rows, seedPx.x, seedPx.y);
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
function resolveRegionOutlineSeedPx(binary, cols, rows, normSeed) {
    if (normSeed) {
        return {
            x: Math.min(cols - 1, Math.max(0, Math.floor(normSeed.x * cols))),
            y: Math.min(rows - 1, Math.max(0, Math.floor(normSeed.y * rows))),
        };
    }
    return findLargestComponentSeed(binary, cols, rows) ?? undefined;
}
export function buildRegionOutlinePathForRegion(regionId, regions, maskData, rect, normSeed) {
    const binaries = extractRegionBinaries(regions, maskData);
    const binary = binaries.get(regionId);
    if (!binary) {
        return Skia.Path.Make();
    }
    const { cols, rows } = maskData;
    const seedPx = resolveRegionOutlineSeedPx(binary, cols, rows, normSeed);
    return buildRegionOutlinePathFromBinary(binary, cols, rows, rect, seedPx);
}
function extractRegionBinaries(regions, maskData) {
    const { labels, baseboardBinary, cols, rows } = maskData;
    const size = cols * rows;
    const binaries = new Map();
    const semanticColors = getMaskSegmentRuntimeConfig().mask.semanticColors;
    const regionIdBySemantic = new Int32Array(semanticColors.length);
    regionIdBySemantic.fill(-1);
    let baseboardRegionId = null;
    for (const reg of regions) {
        binaries.set(reg.id, new Uint8Array(size));
        if (reg.thinStrip) {
            baseboardRegionId = reg.id;
            continue;
        }
        const semanticIndex = semanticColors.findIndex(entry => entry.name === reg.name);
        if (semanticIndex >= 0) {
            regionIdBySemantic[semanticIndex] = reg.id;
        }
    }
    const semanticCount = semanticColors.length;
    for (let i = 0; i < size; i++) {
        if (baseboardRegionId != null && baseboardBinary[i] > 0) {
            binaries.get(baseboardRegionId)[i] = 255;
            continue;
        }
        const semanticIndex = labels[i];
        if (semanticIndex < semanticCount && regionIdBySemantic[semanticIndex] >= 0) {
            binaries.get(regionIdBySemantic[semanticIndex])[i] = 255;
        }
    }
    return binaries;
}
export function buildAllRegionOutlinePaths(regions, maskData, rect) {
    const { cols, rows } = maskData;
    const binaries = extractRegionBinaries(regions, maskData);
    const map = new Map();
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
        map.set(reg.id, buildRegionOutlinePathFromBinary(binary, cols, rows, rect));
    }
    return map;
}
function isBaseboardEntry(entry) {
    return entry.name === BASEBOARD_SEMANTIC_NAME;
}
/** 踢脚线：仅同行横向补缝，不纵向膨胀 */
function bridgeBaseboardHorizontally(binary, cols, rows) {
    const out = new Uint8Array(binary);
    const halfW = maskCfg().kickBridgeHalfWPx;
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (!binary[y * cols + x]) {
                continue;
            }
            for (let dx = -halfW; dx <= halfW; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= cols) {
                    continue;
                }
                out[y * cols + nx] = 255;
            }
        }
    }
    return out;
}
function rowRunsToPolygons(runs, cols, rows) {
    return runs.map(run => [
        { x: run.minX / cols, y: run.y / rows },
        { x: (run.maxX + 1) / cols, y: run.y / rows },
        { x: (run.maxX + 1) / cols, y: (run.y + 1) / rows },
        { x: run.minX / cols, y: (run.y + 1) / rows },
    ]);
}
function quantChannelSlot(value) {
    const q = Math.min(255, Math.round(value / maskCfg().quantStep) * maskCfg().quantStep);
    if (q >= 192) {
        return q === 255 ? 4 : 3;
    }
    if (q >= 128) {
        return 2;
    }
    if (q >= 64) {
        return 1;
    }
    return 0;
}
function quantKeyIndex(b, g, r) {
    return (quantChannelSlot(b) * 25 + quantChannelSlot(g) * 5 + quantChannelSlot(r));
}
function getStripQuantIndices() {
    const revision = getMaskRuntimeRevision();
    if (stripIndicesRevision === revision && cachedStripQuantIndices) {
        return cachedStripQuantIndices;
    }
    cachedStripQuantIndices = new Set([...getBaseboardStripQuantKeys()].map(key => {
        const [b, g, r] = key.split(',').map(part => Number(part));
        return quantKeyIndex(b, g, r);
    }));
    stripIndicesRevision = revision;
    return cachedStripQuantIndices;
}
let stripIndicesRevision = -1;
let cachedStripQuantIndices = null;
let channelSlotLutRevision = -1;
let cachedChannelSlotLut = null;
function buildQuantChannelSlotLut(quantStep) {
    const lut = new Uint8Array(256);
    for (let value = 0; value < 256; value++) {
        const q = Math.min(255, Math.round(value / quantStep) * quantStep);
        if (q >= 192) {
            lut[value] = q === 255 ? 4 : 3;
        }
        else if (q >= 128) {
            lut[value] = 2;
        }
        else if (q >= 64) {
            lut[value] = 1;
        }
        else {
            lut[value] = 0;
        }
    }
    return lut;
}
function getQuantChannelSlotLut() {
    const revision = getMaskRuntimeRevision();
    if (channelSlotLutRevision === revision && cachedChannelSlotLut) {
        return cachedChannelSlotLut;
    }
    cachedChannelSlotLut = buildQuantChannelSlotLut(maskCfg().quantStep);
    channelSlotLutRevision = revision;
    return cachedChannelSlotLut;
}
function quantSlotToChannel(slot) {
    if (slot >= 4) {
        return 255;
    }
    if (slot >= 3) {
        return 192;
    }
    if (slot >= 2) {
        return 128;
    }
    if (slot >= 1) {
        return 64;
    }
    return 0;
}
function quantIndexToBgr(idx) {
    const bSlot = (idx / 25) | 0;
    const gSlot = ((idx % 25) / 5) | 0;
    const rSlot = idx % 5;
    return [
        quantSlotToChannel(bSlot),
        quantSlotToChannel(gSlot),
        quantSlotToChannel(rSlot),
    ];
}
let semanticLutRevision = -1;
let cachedSemanticLut = null;
let cachedStripQuantLut = null;
let stripQuantLutRevision = -1;
function getStripQuantLut() {
    const revision = getMaskRuntimeRevision();
    if (stripQuantLutRevision === revision && cachedStripQuantLut) {
        return cachedStripQuantLut;
    }
    const lut = new Uint8Array(125);
    for (const idx of getStripQuantIndices()) {
        lut[idx] = 1;
    }
    cachedStripQuantLut = lut;
    stripQuantLutRevision = revision;
    return lut;
}
function bboxFromBinary(binary, cols, rows) {
    let minX = cols;
    let minY = rows;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < rows; y++) {
        const row = y * cols;
        for (let x = 0; x < cols; x++) {
            if (!binary[row + x]) {
                continue;
            }
            if (x < minX) {
                minX = x;
            }
            if (x > maxX) {
                maxX = x;
            }
            if (y < minY) {
                minY = y;
            }
            if (y > maxY) {
                maxY = y;
            }
        }
    }
    if (maxX < 0) {
        return null;
    }
    return {
        x: minX / cols,
        y: minY / rows,
        w: (maxX - minX + 1) / cols,
        h: (maxY - minY + 1) / rows,
    };
}
/** 从二值图逐行条带构建蒙版（供 Skia PathBuilder 使用） */
export function appendMaskBinaryToPathBuilder(binary, cols, rows, rect, builder, minRunPx = maskCfg().baseboardMinRunPx) {
    for (let y = 0; y < rows; y++) {
        let runStart = -1;
        const normY0 = y / rows;
        const normY1 = (y + 1) / rows;
        const screenY0 = rect.y + normY0 * rect.h;
        const screenY1 = rect.y + normY1 * rect.h;
        for (let x = 0; x <= cols; x++) {
            const on = x < cols && binary[y * cols + x] > 0;
            if (on && runStart < 0) {
                runStart = x;
            }
            if (!on && runStart >= 0) {
                if (x - runStart >= minRunPx) {
                    const normX0 = runStart / cols;
                    const normX1 = x / cols;
                    builder.moveTo(rect.x + normX0 * rect.w, screenY0);
                    builder.lineTo(rect.x + normX1 * rect.w, screenY0);
                    builder.lineTo(rect.x + normX1 * rect.w, screenY1);
                    builder.lineTo(rect.x + normX0 * rect.w, screenY1);
                    builder.close();
                }
                runStart = -1;
            }
        }
    }
}
/** 从语义标签逐行条带构建蒙版（避免维护多张二值图） */
export function appendLabelMaskToPathBuilder(labels, semanticIndex, cols, rows, rect, builder, minRunPx = maskCfg().baseboardMinRunPx) {
    for (let y = 0; y < rows; y++) {
        let runStart = -1;
        const row = y * cols;
        const normY0 = y / rows;
        const normY1 = (y + 1) / rows;
        const screenY0 = rect.y + normY0 * rect.h;
        const screenY1 = rect.y + normY1 * rect.h;
        for (let x = 0; x <= cols; x++) {
            const on = x < cols &&
                labels[row + x] === semanticIndex;
            if (on && runStart < 0) {
                runStart = x;
            }
            if (!on && runStart >= 0) {
                if (x - runStart >= minRunPx) {
                    const normX0 = runStart / cols;
                    const normX1 = x / cols;
                    builder.moveTo(rect.x + normX0 * rect.w, screenY0);
                    builder.lineTo(rect.x + normX1 * rect.w, screenY0);
                    builder.lineTo(rect.x + normX1 * rect.w, screenY1);
                    builder.lineTo(rect.x + normX0 * rect.w, screenY1);
                    builder.close();
                }
                runStart = -1;
            }
        }
    }
}
function appendRunRectToBuilder(runStart, runEnd, y, cols, rows, rect, builder, minRunPx) {
    if (runEnd - runStart < minRunPx) {
        return;
    }
    const normY0 = y / rows;
    const normY1 = (y + 1) / rows;
    const screenY0 = rect.y + normY0 * rect.h;
    const screenY1 = rect.y + normY1 * rect.h;
    const normX0 = runStart / cols;
    const normX1 = runEnd / cols;
    builder.moveTo(rect.x + normX0 * rect.w, screenY0);
    builder.lineTo(rect.x + normX1 * rect.w, screenY0);
    builder.lineTo(rect.x + normX1 * rect.w, screenY1);
    builder.lineTo(rect.x + normX0 * rect.w, screenY1);
    builder.close();
}
/** 蒙版路径构建降采样（屏幕显示不需要分割分辨率，点击仍用全分辨率 pickMap） */
export function downsampleMaskDataForPaths(maskData, maxLongSide) {
    const { labels, baseboardBinary, cols, rows } = maskData;
    const longSide = Math.max(cols, rows);
    if (longSide <= maxLongSide) {
        return maskData;
    }
    const scale = maxLongSide / longSide;
    const dstCols = Math.max(1, Math.floor(cols * scale));
    const dstRows = Math.max(1, Math.floor(rows * scale));
    const outLabels = new Uint8Array(dstCols * dstRows);
    const outBaseboard = new Uint8Array(dstCols * dstRows);
    for (let y = 0; y < dstRows; y++) {
        const sy = Math.min(rows - 1, Math.floor((y * rows) / dstRows));
        const srcRow = sy * cols;
        const dstRow = y * dstCols;
        for (let x = 0; x < dstCols; x++) {
            const sx = Math.min(cols - 1, Math.floor((x * cols) / dstCols));
            const si = srcRow + sx;
            const di = dstRow + x;
            outLabels[di] = labels[si];
            outBaseboard[di] = baseboardBinary[si];
        }
    }
    return {
        labels: outLabels,
        baseboardBinary: outBaseboard,
        cols: dstCols,
        rows: dstRows,
    };
}
/** 单次扫描构建所有分区 Skia 蒙版路径（单 label pass，避免每像素 × 语义数循环） */
export function buildAllRegionMaskPaths(regions, maskData, rect) {
    const { labels, baseboardBinary, cols, rows } = maskData;
    const builders = new Map();
    const semanticColors = getMaskSegmentRuntimeConfig().mask.semanticColors;
    const regionIdBySemantic = new Int32Array(semanticColors.length);
    regionIdBySemantic.fill(-1);
    let baseboardRegionId = null;
    for (const reg of regions) {
        builders.set(reg.id, Skia.Path.Make());
        if (reg.thinStrip) {
            baseboardRegionId = reg.id;
            continue;
        }
        const semanticIndex = semanticColors.findIndex(entry => entry.name === reg.name);
        if (semanticIndex >= 0) {
            regionIdBySemantic[semanticIndex] = reg.id;
        }
    }
    const semanticCount = semanticColors.length;
    const minRunPx = maskCfg().baseboardMinRunPx;
    for (let y = 0; y < rows; y++) {
        let baseboardRunStart = -1;
        let labelRunStart = -1;
        let labelRunSemantic = -1;
        const row = y * cols;
        for (let x = 0; x <= cols; x++) {
            if (baseboardRegionId != null) {
                const bbOn = x < cols && baseboardBinary[row + x] > 0;
                if (bbOn && baseboardRunStart < 0) {
                    baseboardRunStart = x;
                }
                if (!bbOn && baseboardRunStart >= 0) {
                    appendRunRectToBuilder(baseboardRunStart, x, y, cols, rows, rect, builders.get(baseboardRegionId), minRunPx);
                    baseboardRunStart = -1;
                }
            }
            let activeSemantic = -1;
            if (x < cols) {
                const si = labels[row + x];
                if (si < semanticCount && regionIdBySemantic[si] >= 0) {
                    activeSemantic = si;
                }
            }
            if (activeSemantic !== labelRunSemantic) {
                if (labelRunSemantic >= 0 && labelRunStart >= 0) {
                    const regionId = regionIdBySemantic[labelRunSemantic];
                    appendRunRectToBuilder(labelRunStart, x, y, cols, rows, rect, builders.get(regionId), minRunPx);
                }
                labelRunSemantic = activeSemantic;
                labelRunStart = activeSemantic >= 0 ? x : -1;
            }
        }
    }
    const paths = new Map();
    for (const [regionId, builder] of builders) {
        paths.set(regionId, builder);
    }
    return paths;
}
function collectRowRuns(binary, cols, rows, minRunPx) {
    const runs = [];
    for (let y = 0; y < rows; y++) {
        let runStart = -1;
        for (let x = 0; x <= cols; x++) {
            const on = x < cols && binary[y * cols + x] > 0;
            if (on && runStart < 0) {
                runStart = x;
            }
            if (!on && runStart >= 0) {
                if (x - runStart >= minRunPx) {
                    runs.push({ minX: runStart, maxX: x - 1, y });
                }
                runStart = -1;
            }
        }
    }
    return runs;
}
function bboxFromPolygons(polygons) {
    if (polygons.length === 0) {
        return null;
    }
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const polygon of polygons) {
        for (const point of polygon) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
/** baseboard：逐行 1px 条带贴合掩码；点击用横向补缝后的条带 */
function extractBaseboardRowPolygons(binary, cols, rows) {
    let totalArea = 0;
    for (let i = 0; i < binary.length; i++) {
        if (binary[i]) {
            totalArea += 1;
        }
    }
    const runs = collectRowRuns(binary, cols, rows, maskCfg().baseboardMinRunPx);
    const polygons = rowRunsToPolygons(runs, cols, rows);
    const bridged = bridgeBaseboardHorizontally(binary, cols, rows);
    const bridgedRuns = collectRowRuns(bridged, cols, rows, maskCfg().baseboardMinRunPx);
    const hitPolygons = rowRunsToPolygons(bridgedRuns, cols, rows);
    const bbox = bboxFromPolygons(polygons);
    return {
        polygons,
        hitPolygons,
        totalArea,
        bbox,
    };
}
function cloneBinary(binary) {
    return new Uint8Array(binary);
}
function subtractBinary(target, mask) {
    for (let i = 0; i < target.length; i++) {
        if (mask[i]) {
            target[i] = 0;
        }
    }
}
function minPalettePixels(cols, rows) {
    return Math.max(300, Math.floor((cols * rows) / 2000));
}
function minPixelsForSemantic(name, cols, rows) {
    const base = minPalettePixels(cols, rows);
    if (!maskCfg().secondarySemanticNames.has(name)) {
        return base;
    }
    return Math.max(base, Math.floor(cols * rows * maskCfg().secondaryMinPixelRatio));
}
function quantizeChannel(value) {
    return Math.min(255, Math.round(value / maskCfg().quantStep) * maskCfg().quantStep);
}
function maskQuantKey(b, g, r) {
    return `${quantizeChannel(b)},${quantizeChannel(g)},${quantizeChannel(r)}`;
}
function dilateBinaryBox(source, cols, rows, radiusX, radiusY) {
    const temp = new Uint8Array(source.length);
    const out = new Uint8Array(source.length);
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (!source[y * cols + x]) {
                continue;
            }
            const minX = Math.max(0, x - radiusX);
            const maxX = Math.min(cols - 1, x + radiusX);
            for (let nx = minX; nx <= maxX; nx++) {
                temp[y * cols + nx] = 255;
            }
        }
    }
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (!temp[y * cols + x]) {
                continue;
            }
            const minY = Math.max(0, y - radiusY);
            const maxY = Math.min(rows - 1, y + radiusY);
            for (let ny = minY; ny <= maxY; ny++) {
                out[ny * cols + x] = 255;
            }
        }
    }
    return out;
}
function buildWallCabinetJunctionMask(buffer, cols, rows) {
    const wall = new Uint8Array(cols * rows);
    const cabinet = new Uint8Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) {
        const o = i * 3;
        const b = buffer[o];
        const g = buffer[o + 1];
        const r = buffer[o + 2];
        if (isIgnoredColor(b, g, r)) {
            continue;
        }
        const key = maskQuantKey(b, g, r);
        if (getWallQuantKeys().has(key)) {
            wall[i] = 255;
        }
        if (getCabinetQuantKeys().has(key)) {
            cabinet[i] = 255;
        }
    }
    const wallNear = dilateBinaryBox(wall, cols, rows, maskCfg().junctionHRadiusPx, maskCfg().junctionVRadiusPx);
    const cabinetNear = dilateBinaryBox(cabinet, cols, rows, maskCfg().junctionHRadiusPx, maskCfg().junctionVRadiusPx);
    const junction = new Uint8Array(cols * rows);
    for (let i = 0; i < junction.length; i++) {
        if (wallNear[i] && cabinetNear[i]) {
            junction[i] = 255;
        }
    }
    return junction;
}
function computeStrictBaseboardBand(strictBaseboard, cols, rows) {
    let minY = rows;
    let maxY = -1;
    for (let y = 0; y < rows; y++) {
        const row = y * cols;
        for (let x = 0; x < cols; x++) {
            if (!strictBaseboard[row + x]) {
                continue;
            }
            if (y < minY) {
                minY = y;
            }
            if (y > maxY) {
                maxY = y;
            }
        }
    }
    if (maxY < 0) {
        return null;
    }
    return { minY, maxY };
}
/** 仅保留贴近真实踢脚线带的 junction 细条，避免上方墙柜交界零碎区域误入 */
function isJunctionNearStrictBaseboard(idx, strictBaseboard, cols, rows, band) {
    if (!band) {
        return false;
    }
    const x = idx % cols;
    const y = (idx - x) / cols;
    if (y < band.minY - maskCfg().baseboardJunctionRowMarginPx ||
        y > band.maxY + maskCfg().baseboardJunctionRowMarginPx) {
        return false;
    }
    const halfW = maskCfg().kickBridgeHalfWPx;
    for (let dy = -maskCfg().baseboardJunctionVReachPx; dy <= maskCfg().baseboardJunctionVReachPx; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= rows) {
            continue;
        }
        const row = ny * cols;
        for (let dx = -halfW; dx <= halfW; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= cols) {
                continue;
            }
            if (strictBaseboard[row + nx]) {
                return true;
            }
        }
    }
    return false;
}
function buildBaseboardBinary(buffer, cols, rows, junctionMask) {
    const binary = new Uint8Array(cols * rows);
    const junction = junctionMask ?? buildWallCabinetJunctionMask(buffer, cols, rows);
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const idx = y * cols + x;
            const o = idx * 3;
            const b = buffer[o];
            const g = buffer[o + 1];
            const r = buffer[o + 2];
            if (isIgnoredColor(b, g, r)) {
                continue;
            }
            if (isStrictBaseboardPixel(b, g, r)) {
                binary[idx] = 255;
            }
        }
    }
    const band = computeStrictBaseboardBand(binary, cols, rows);
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const idx = y * cols + x;
            if (binary[idx]) {
                continue;
            }
            const o = idx * 3;
            const b = buffer[o];
            const g = buffer[o + 1];
            const r = buffer[o + 2];
            if (isIgnoredColor(b, g, r)) {
                continue;
            }
            const key = maskQuantKey(b, g, r);
            if (getBaseboardStripQuantKeys().has(key) &&
                junction[idx] &&
                isJunctionNearStrictBaseboard(idx, binary, cols, rows, band)) {
                binary[idx] = 255;
            }
        }
    }
    return binary;
}
export function buildBaseboardBinaryFromMask(buffer, cols, rows) {
    return buildBaseboardBinary(buffer, cols, rows);
}
/** 分割分辨率踢脚线二值图最近邻放大到点击查表分辨率（避免全图 junction 重算） */
export function upscaleBinaryMask(src, srcCols, srcRows, dstCols, dstRows) {
    const dst = new Uint8Array(dstCols * dstRows);
    for (let y = 0; y < dstRows; y++) {
        const sy = Math.min(srcRows - 1, Math.floor((y * srcRows) / dstRows));
        const srcRow = sy * srcCols;
        const dstRow = y * dstCols;
        for (let x = 0; x < dstCols; x++) {
            const sx = Math.min(srcCols - 1, Math.floor((x * srcCols) / dstCols));
            dst[dstRow + x] = src[srcRow + sx];
        }
    }
    return dst;
}
function buildMaskPolygonsFromBinary(binary, cols, rows) {
    return rowRunsToPolygons(collectRowRuns(binary, cols, rows, maskCfg().baseboardMinRunPx), cols, rows);
}
export function isBaseboardMaskPixel(buffer, cols, rows, x, y, baseboardBinary) {
    if (x < 0 || y < 0 || x >= cols || y >= rows) {
        return false;
    }
    if (baseboardBinary) {
        return baseboardBinary[y * cols + x] > 0;
    }
    const o = (y * cols + x) * 3;
    const b = buffer[o];
    const g = buffer[o + 1];
    const r = buffer[o + 2];
    if (isIgnoredColor(b, g, r)) {
        return false;
    }
    if (isStrictBaseboardPixel(b, g, r)) {
        return true;
    }
    const key = maskQuantKey(b, g, r);
    if (!getBaseboardStripQuantKeys().has(key)) {
        return false;
    }
    const junction = buildWallCabinetJunctionMask(buffer, cols, rows);
    return junction[y * cols + x] > 0;
}
export { isStrictBaseboardPixel as isBaseboardPixel } from './maskSemanticPalette';
export function getMaskQuantKey(b, g, r) {
    return maskQuantKey(b, g, r);
}
/** @deprecated 请使用 isBaseboardMaskPixel */
export function isKickPlatePixel(b, g, r) {
    return isStrictBaseboardPixel(b, g, r);
}
function mergeBBox(bbox, next) {
    const x1 = Math.min(bbox.x, next.x);
    const y1 = Math.min(bbox.y, next.y);
    const x2 = Math.max(bbox.x + bbox.w, next.x + next.w);
    const y2 = Math.max(bbox.y + bbox.h, next.y + next.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
function isIgnoredColor(b, g, r) {
    const threshold = maskCfg().blackThreshold;
    return b < threshold && g < threshold && r < threshold;
}
function countBinaryPixels(binary) {
    let count = 0;
    for (let i = 0; i < binary.length; i++) {
        if (binary[i]) {
            count += 1;
        }
    }
    return count;
}
const IGNORE_SEMANTIC_INDEX = 255;
let nameToIndexRevision = -1;
let cachedNameToIndex = null;
function getSemanticNameToIndex() {
    const revision = getMaskRuntimeRevision();
    if (nameToIndexRevision === revision && cachedNameToIndex) {
        return cachedNameToIndex;
    }
    const colors = getMaskSegmentRuntimeConfig().mask.semanticColors;
    cachedNameToIndex = new Map(colors.map((entry, index) => [entry.name, index]));
    nameToIndexRevision = revision;
    return cachedNameToIndex;
}
function createSemanticLut() {
    const revision = getMaskRuntimeRevision();
    if (semanticLutRevision === revision && cachedSemanticLut) {
        return cachedSemanticLut;
    }
    const lut = new Uint8Array(125);
    lut.fill(IGNORE_SEMANTIC_INDEX);
    const colors = getMaskSegmentRuntimeConfig().mask.semanticColors;
    const nameToIndex = getSemanticNameToIndex();
    for (const entry of colors) {
        const semanticIndex = nameToIndex.get(entry.name);
        if (semanticIndex === undefined) {
            continue;
        }
        const { b, g, r } = entry.bgr;
        lut[quantKeyIndex(b, g, r)] = semanticIndex;
    }
    for (let idx = 0; idx < 125; idx++) {
        if (lut[idx] !== IGNORE_SEMANTIC_INDEX) {
            continue;
        }
        const [b, g, r] = quantIndexToBgr(idx);
        const name = classifyBgrPixelToSemantic(b, g, r);
        lut[idx] = nameToIndex.get(name) ?? IGNORE_SEMANTIC_INDEX;
    }
    cachedSemanticLut = lut;
    semanticLutRevision = revision;
    return lut;
}
/** 单次扫描：像素语义标签 + 像素计数 + bbox（不写多张二值图） */
function buildSemanticLayout(buffer, cols, rows) {
    const pixelCount = cols * rows;
    const labels = new Uint8Array(pixelCount);
    labels.fill(IGNORE_SEMANTIC_INDEX);
    const counts = new Map();
    const bboxes = new Map();
    const semanticLut = createSemanticLut();
    const nameToIndex = getSemanticNameToIndex();
    const indexToName = getMaskSegmentRuntimeConfig().mask.semanticColors.map(entry => entry.name);
    const semanticCount = indexToName.length;
    const blackThreshold = maskCfg().blackThreshold;
    const channelSlotLut = getQuantChannelSlotLut();
    const stripQuantLut = getStripQuantLut();
    const minX = new Int32Array(semanticCount);
    const minY = new Int32Array(semanticCount);
    const maxX = new Int32Array(semanticCount);
    const maxY = new Int32Array(semanticCount);
    const hitMask = new Uint8Array(semanticCount);
    const countArr = new Int32Array(semanticCount);
    const stripIndices = [];
    const strictBaseboard = new Uint8Array(pixelCount);
    let strictBaseboardCount = 0;
    const baseboardIdx = nameToIndex.get(BASEBOARD_SEMANTIC_NAME);
    minX.fill(cols);
    minY.fill(rows);
    maxX.fill(-1);
    maxY.fill(-1);
    const buf = buffer;
    for (let y = 0; y < rows; y++) {
        const row = y * cols;
        for (let x = 0; x < cols; x++) {
            const i = row + x;
            const o = i * 3;
            const b = buf[o];
            const g = buf[o + 1];
            const r = buf[o + 2];
            if (b < blackThreshold && g < blackThreshold && r < blackThreshold) {
                continue;
            }
            const lutIdx = channelSlotLut[b] * 25 + channelSlotLut[g] * 5 + channelSlotLut[r];
            if (stripQuantLut[lutIdx]) {
                stripIndices.push(i);
            }
            const semanticIndex = semanticLut[lutIdx];
            if (semanticIndex === IGNORE_SEMANTIC_INDEX) {
                continue;
            }
            labels[i] = semanticIndex;
            hitMask[semanticIndex] = 1;
            countArr[semanticIndex] += 1;
            if (semanticIndex === baseboardIdx) {
                strictBaseboard[i] = 255;
                strictBaseboardCount += 1;
            }
            if (x < minX[semanticIndex]) {
                minX[semanticIndex] = x;
            }
            if (x > maxX[semanticIndex]) {
                maxX[semanticIndex] = x;
            }
            if (y < minY[semanticIndex]) {
                minY[semanticIndex] = y;
            }
            if (y > maxY[semanticIndex]) {
                maxY[semanticIndex] = y;
            }
        }
    }
    const invCols = 1 / cols;
    const invRows = 1 / rows;
    for (let semanticIndex = 0; semanticIndex < semanticCount; semanticIndex++) {
        if (!hitMask[semanticIndex]) {
            continue;
        }
        const name = indexToName[semanticIndex];
        counts.set(name, countArr[semanticIndex]);
        bboxes.set(name, {
            x: minX[semanticIndex] * invCols,
            y: minY[semanticIndex] * invRows,
            w: (maxX[semanticIndex] - minX[semanticIndex] + 1) * invCols,
            h: (maxY[semanticIndex] - minY[semanticIndex] + 1) * invRows,
        });
    }
    return {
        labels,
        counts,
        bboxes,
        stripIndices,
        strictBaseboard,
        strictBaseboardCount,
    };
}
function buildJunctionAtStripPixels(labels, stripIndices, cols, rows) {
    const junction = new Uint8Array(cols * rows);
    const junctionIndices = [];
    const nameToIndex = getSemanticNameToIndex();
    const wallIdx = nameToIndex.get('wall');
    const cabinetIdx = nameToIndex.get('cabinet');
    const junctionH = maskCfg().junctionHRadiusPx;
    const junctionV = maskCfg().junctionVRadiusPx;
    if (wallIdx === undefined ||
        cabinetIdx === undefined ||
        stripIndices.length === 0) {
        return { junction, junctionIndices };
    }
    for (const idx of stripIndices) {
        const x = idx % cols;
        const y = (idx - x) / cols;
        let hasWall = false;
        let hasCabinet = false;
        const minY = Math.max(0, y - junctionV);
        const maxY = Math.min(rows - 1, y + junctionV);
        const minX = Math.max(0, x - junctionH);
        const maxX = Math.min(cols - 1, x + junctionH);
        for (let ny = minY; ny <= maxY && !(hasWall && hasCabinet); ny++) {
            const rowBase = ny * cols;
            for (let nx = minX; nx <= maxX && !(hasWall && hasCabinet); nx++) {
                const label = labels[rowBase + nx];
                if (label === wallIdx) {
                    hasWall = true;
                }
                else if (label === cabinetIdx) {
                    hasCabinet = true;
                }
            }
        }
        if (hasWall && hasCabinet) {
            junction[idx] = 255;
            junctionIndices.push(idx);
        }
    }
    return { junction, junctionIndices };
}
function finalizeBaseboardBinary(strictBaseboard, strictCount, junctionIndices, cols, rows) {
    const binary = new Uint8Array(strictBaseboard);
    const band = computeStrictBaseboardBand(binary, cols, rows);
    let pixelCount = strictCount;
    for (const idx of junctionIndices) {
        if (!isJunctionNearStrictBaseboard(idx, binary, cols, rows, band)) {
            continue;
        }
        if (!binary[idx]) {
            pixelCount += 1;
        }
        binary[idx] = 255;
    }
    return { binary, pixelCount };
}
function buildPickMapAndWorkAreas(labels, indexToName, nameToId, baseboardBinary, cols, rows) {
    const pixelCount = cols * rows;
    const pick = new Uint8Array(pixelCount);
    const workAreas = new Map();
    const baseboardName = BASEBOARD_SEMANTIC_NAME;
    const baseboardId = nameToId.get(baseboardName);
    const baseboardCode = baseboardId === undefined ? 0 : baseboardId + 1;
    for (let i = 0; i < pixelCount; i++) {
        if (baseboardBinary[i]) {
            if (baseboardCode > 0) {
                pick[i] = baseboardCode;
            }
            workAreas.set(baseboardName, (workAreas.get(baseboardName) ?? 0) + 1);
            continue;
        }
        const semanticIndex = labels[i];
        if (semanticIndex === IGNORE_SEMANTIC_INDEX) {
            continue;
        }
        const name = indexToName[semanticIndex];
        if (!name) {
            continue;
        }
        const regionId = nameToId.get(name);
        if (regionId !== undefined) {
            pick[i] = regionId + 1;
        }
        workAreas.set(name, (workAreas.get(name) ?? 0) + 1);
    }
    return { pick, workAreas };
}
/**
 * 1-pass 8-neighbour majority-vote dilate on the pick buffer.
 * For each zero pixel, count the 8-connected neighbours by their non-zero
 * pick code.  If any single code appears in ≥ 4 neighbours, fill the pixel
 * with that code (majority rule).
 *
 * Compared to the old 4-neighbour "all-must-agree" rule this handles:
 *   - diagonal holes inside a region (8-connectivity)
 *   - narrow door / furniture strips where a hole borders both the strip
 *     AND a neighbouring wall region — majority vote picks the region that
 *     occupies more of the 8-pixel perimeter
 *
 * Still reads from the ORIGINAL pick buffer to prevent cascade overflow.
 * Cost: O(N) with ~20 ops/pixel — negligible relative to segmentation.
 */
function dilatePickBuffer1px(pick, cols, rows) {
    const pixelCount = cols * rows;
    const dst = new Uint8Array(pixelCount);
    dst.set(pick);
    for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
            const i = y * cols + x;
            if (pick[i] !== 0)
                continue;
            // Read 8 neighbours from the ORIGINAL pick buffer to avoid cascade.
            const n = [
                pick[(y - 1) * cols + (x - 1)],
                pick[(y - 1) * cols + x],
                pick[(y - 1) * cols + (x + 1)],
                pick[y * cols + (x - 1)],
                pick[y * cols + (x + 1)],
                pick[(y + 1) * cols + (x - 1)],
                pick[(y + 1) * cols + x],
                pick[(y + 1) * cols + (x + 1)], // bottom-right
            ];
            // Count occurrences of each non-zero code.
            const counts = {};
            for (let k = 0; k < 8; k++) {
                const code = n[k];
                if (code !== 0) {
                    counts[code] = (counts[code] ?? 0) + 1;
                }
            }
            // Majority rule: ≥ 4 of 8 neighbours share the same code.
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
function paletteFromCounts(counts, cols, rows) {
    const orderedSemantics = getMaskSegmentRuntimeConfig().mask.semanticColors.map(entry => entry.name);
    return orderedSemantics
        .map(name => {
        const pixelCount = counts.get(name) ?? 0;
        if (pixelCount < minPixelsForSemantic(name, cols, rows)) {
            return null;
        }
        const ref = getSemanticColorByName(name);
        return {
            label: orderedSemantics.indexOf(name),
            name,
            hex: ref.hex,
            color: { ...ref.bgr },
        };
    })
        .filter((entry) => entry != null)
        .sort((a, b) => (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0))
        .slice(0, maskCfg().maxRegionColors);
}
async function contourToPolygon(contour, cols, rows, minArea, approxEpsilon) {
    const area = await cv.contourArea(contour);
    if (area < minArea) {
        return null;
    }
    const rect = await cv.boundingRect(contour);
    const perimeter = await cv.arcLength(contour, true);
    const maxEpsilonPx = Math.max(cols, rows) * 0.01;
    const thinSide = Math.min(rect.width, rect.height);
    const epsilonPx = Math.max(1.5, Math.min(perimeter * approxEpsilon, maxEpsilonPx, Math.max(2, thinSide * 0.12)));
    const points = await cv.approxPolyDP(contour, epsilonPx, true);
    if (points.length < 3) {
        return null;
    }
    let minX = cols;
    let minY = rows;
    let maxX = 0;
    let maxY = 0;
    const polygon = points.map(point => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
        return { x: point.x / cols, y: point.y / rows };
    });
    return {
        polygon,
        area,
        bbox: {
            x: minX / cols,
            y: minY / rows,
            w: (maxX - minX + 1) / cols,
            h: (maxY - minY + 1) / rows,
        },
    };
}
function extractPolygonsFromBinaryJs(binary, cols, rows, minArea) {
    const visited = new Uint8Array(cols * rows);
    const polygons = [];
    let totalArea = 0;
    let bbox = null;
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const idx = y * cols + x;
            if (!binary[idx] || visited[idx]) {
                continue;
            }
            let minX = x;
            let maxX = x;
            let minY = y;
            let maxY = y;
            let area = 0;
            const stack = [[x, y]];
            visited[idx] = 1;
            while (stack.length > 0) {
                const [cx, cy] = stack.pop();
                area += 1;
                minX = Math.min(minX, cx);
                maxX = Math.max(maxX, cx);
                minY = Math.min(minY, cy);
                maxY = Math.max(maxY, cy);
                if (cx > 0) {
                    const left = cy * cols + (cx - 1);
                    if (binary[left] && !visited[left]) {
                        visited[left] = 1;
                        stack.push([cx - 1, cy]);
                    }
                }
                if (cx + 1 < cols) {
                    const right = cy * cols + (cx + 1);
                    if (binary[right] && !visited[right]) {
                        visited[right] = 1;
                        stack.push([cx + 1, cy]);
                    }
                }
                if (cy > 0) {
                    const up = (cy - 1) * cols + cx;
                    if (binary[up] && !visited[up]) {
                        visited[up] = 1;
                        stack.push([cx, cy - 1]);
                    }
                }
                if (cy + 1 < rows) {
                    const down = (cy + 1) * cols + cx;
                    if (binary[down] && !visited[down]) {
                        visited[down] = 1;
                        stack.push([cx, cy + 1]);
                    }
                }
            }
            if (area < minArea) {
                continue;
            }
            const polygon = [
                { x: minX / cols, y: minY / rows },
                { x: (maxX + 1) / cols, y: minY / rows },
                { x: (maxX + 1) / cols, y: (maxY + 1) / rows },
                { x: minX / cols, y: (maxY + 1) / rows },
            ];
            const partBbox = {
                x: minX / cols,
                y: minY / rows,
                w: (maxX - minX + 1) / cols,
                h: (maxY - minY + 1) / rows,
            };
            polygons.push(polygon);
            totalArea += area;
            bbox = bbox ? mergeBBox(bbox, partBbox) : partBbox;
        }
    }
    return { polygons, totalArea, bbox };
}
async function extractPolygonsFromBinary(binary, cols, rows, minArea, approxEpsilon) {
    const binaryMat = cv.binaryBufferToMat(binary, cols, rows);
    const closed = cv.createMat(cols, rows, 1);
    try {
        const kernel = await cv.getStructuringElement(cv.MORPH_ELLIPSE, {
            width: MORPH_KERNEL_SIZE,
            height: MORPH_KERNEL_SIZE,
        });
        try {
            await cv.morphologyEx(binaryMat, closed, cv.MORPH_OPEN, kernel);
        }
        finally {
            kernel.release();
        }
        const contours = await cv.findContours(closed, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        const polygons = [];
        let totalArea = 0;
        let bbox = null;
        for (const contour of contours) {
            try {
                const part = await contourToPolygon(contour, cols, rows, minArea, approxEpsilon);
                if (!part) {
                    continue;
                }
                polygons.push(part.polygon);
                totalArea += part.area;
                bbox = bbox ? mergeBBox(bbox, part.bbox) : part.bbox;
            }
            finally {
                contour.release();
            }
        }
        return { polygons, totalArea, bbox };
    }
    finally {
        binaryMat.release();
        closed.release();
    }
}
export async function extractRegionsFromMaskBuffer(buffer, cols, rows, _options) {
    return extractRegionsFromMaskBufferSync(buffer, cols, rows, _options);
}
export function extractRegionsFromMaskBufferSync(buffer, cols, rows, _options) {
    const layout = buildSemanticLayout(buffer, cols, rows);
    const baseboardStart = __DEV__ ? performance.now() : 0;
    const { junctionIndices } = buildJunctionAtStripPixels(layout.labels, layout.stripIndices, cols, rows);
    const { binary: baseboardBinary, pixelCount: baseboardPixels } = finalizeBaseboardBinary(layout.strictBaseboard, layout.strictBaseboardCount, junctionIndices, cols, rows);
    layout.counts.set(BASEBOARD_SEMANTIC_NAME, baseboardPixels);
    const paletteEntries = paletteFromCounts(layout.counts, cols, rows);
    if (paletteEntries.length === 0) {
        return {
            regions: [],
            pickMap: { buffer: new Uint8Array(cols * rows), cols, rows },
            labels: layout.labels,
            baseboardBinary,
            segCols: cols,
            segRows: rows,
        };
    }
    const indexToName = getMaskSegmentRuntimeConfig().mask.semanticColors.map(entry => entry.name);
    const regionResults = paletteEntries.map((entry) => {
        const { label, name, hex, color } = entry;
        const isBaseboard = isBaseboardEntry(entry);
        try {
            const finalBbox = isBaseboard
                ? bboxFromBinary(baseboardBinary, cols, rows)
                : layout.bboxes.get(name);
            if (!finalBbox) {
                if (__DEV__) {
                    console.warn(`[MaskSegment] ${name} 无有效轮廓，已跳过`);
                }
                return null;
            }
            const finalPolygons = [bboxToPolygon(finalBbox)];
            return {
                id: label,
                name,
                hex,
                color,
                area: layout.counts.get(name) ?? 0,
                bbox: finalBbox,
                polygons: finalPolygons,
                outlinePolygons: finalPolygons,
                thinStrip: isBaseboard,
            };
        }
        catch (error) {
            if (__DEV__) {
                console.warn(`[MaskSegment] 色 #${label} 提取失败:`, error instanceof Error ? error.message : String(error));
            }
            return null;
        }
    });
    const regions = regionResults.filter((region) => region != null);
    regions.sort((a, b) => b.area - a.area);
    regions.forEach((reg, index) => {
        reg.id = index;
    });
    const finalRegions = regions.slice(0, maskCfg().maxRegionColors);
    const nameToId = new Map(finalRegions.map(reg => [reg.name, reg.id]));
    const pickBuildStart = __DEV__ ? performance.now() : 0;
    const { pick: pickBufferRaw, workAreas } = buildPickMapAndWorkAreas(layout.labels, indexToName, nameToId, baseboardBinary, cols, rows);
    const pickBuffer = dilatePickBuffer1px(pickBufferRaw, cols, rows);
    for (const reg of finalRegions) {
        const workArea = workAreas.get(reg.name);
        if (workArea != null) {
            reg.area = workArea;
        }
    }
    return {
        regions: finalRegions,
        pickMap: { buffer: pickBuffer, cols, rows },
        labels: layout.labels,
        baseboardBinary,
        segCols: cols,
        segRows: rows,
    };
}
/** @deprecated 请使用 extractRegionsFromMaskBuffer */
export async function extractRegionsFromMask(maskMat, options) {
    const { buffer, cols, rows } = cv.matToBuffer(maskMat);
    const result = extractRegionsFromMaskBufferSync(buffer, cols, rows, options);
    return result.regions;
}
//# sourceMappingURL=maskSegmentation.js.map