import { bgrToLab } from './freqLayerPrep';
import { getMaskSegmentRuntimeConfig } from './maskSegmentRuntime';
import { getSemanticColorByName } from './maskSemanticPalette';
/** 非墙像素在 wallSubLabels 中的占位值 */
export const WALL_SUB_LABEL_NONE = 255;
function maskCfg() {
    return getMaskSegmentRuntimeConfig().mask;
}
function bboxToPolygon(bbox) {
    return [
        { x: bbox.x, y: bbox.y },
        { x: bbox.x + bbox.w, y: bbox.y },
        { x: bbox.x + bbox.w, y: bbox.y + bbox.h },
        { x: bbox.x, y: bbox.y + bbox.h },
    ];
}
function computeLabChromaMaps(originBgr, cols, rows) {
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
function chromaMag(a, b) {
    const da = a - 128;
    const db = b - 128;
    return Math.sqrt(da * da + db * db);
}
function chromaDistSq(a0, b0, a1, b1) {
    const da = a0 - a1;
    const db = b0 - b1;
    return da * da + db * db;
}
/** 白/灰墙与蓝/有色墙、或两种不同色相墙之间强制视为材质边界 */
function isCrossMaterialBoundary(a0, b0, a1, b1, neutralChromaMax) {
    const m0 = chromaMag(a0, b0);
    const m1 = chromaMag(a1, b1);
    const neutralGate = neutralChromaMax * 2.2;
    if (m0 <= neutralChromaMax && m1 > neutralGate)
        return true;
    if (m1 <= neutralChromaMax && m0 > neutralGate)
        return true;
    if (m0 > neutralChromaMax && m1 > neutralChromaMax) {
        const hue0 = Math.atan2(b0 - 128, a0 - 128);
        const hue1 = Math.atan2(b1 - 128, a1 - 128);
        let dh = Math.abs(hue0 - hue1);
        if (dh > Math.PI)
            dh = 2 * Math.PI - dh;
        if (dh > Math.PI / 4)
            return true;
    }
    return false;
}
function canMergeWallPixels(refA, refB, na, nb, distSqThreshold, neutralChromaMax) {
    if (isCrossMaterialBoundary(refA, refB, na, nb, neutralChromaMax)) {
        return false;
    }
    return chromaDistSq(refA, refB, na, nb) <= distSqThreshold;
}
function findWallSemanticIndex() {
    const colors = maskCfg().semanticColors;
    return colors.findIndex(entry => entry.name === 'wall');
}
function isWallPixel(labels, baseboardBinary, wallIdx, i) {
    if (baseboardBinary[i])
        return false;
    return labels[i] === wallIdx;
}
/**
 * 4-连通区域生长：与连通域色度均值比较，避免链式桥接；中性/有色墙强制分界。
 */
function labelWallComponents(labels, baseboardBinary, wallIdx, aMap, bMap, cols, rows, distSqThreshold, neutralChromaMax) {
    const pixelCount = cols * rows;
    const compLabels = new Int32Array(pixelCount);
    compLabels.fill(-1);
    let compCount = 0;
    const queue = new Int32Array(pixelCount);
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            if (!isWallPixel(labels, baseboardBinary, wallIdx, i))
                continue;
            if (compLabels[i] >= 0)
                continue;
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
                    if (ni < 0 || ni >= pixelCount)
                        continue;
                    const nx = ni % cols;
                    if (Math.abs(nx - cx) > 1)
                        continue;
                    if (!isWallPixel(labels, baseboardBinary, wallIdx, ni))
                        continue;
                    if (compLabels[ni] >= 0)
                        continue;
                    const na = aMap[ni];
                    const nb = bMap[ni];
                    const stepOk = canMergeWallPixels(aMap[ci], bMap[ci], na, nb, distSqThreshold * 1.8, neutralChromaMax);
                    const meanOk = canMergeWallPixels(meanA, meanB, na, nb, distSqThreshold, neutralChromaMax);
                    const seedOk = canMergeWallPixels(seedA, seedB, na, nb, distSqThreshold * 3, neutralChromaMax);
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
function computeComponentStats(compLabels, compCount, cols, rows) {
    const stats = Array.from({ length: compCount }, (_, label) => ({
        label,
        area: 0,
        bbox: { x: cols, y: rows, w: 0, h: 0 },
    }));
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            const comp = compLabels[i];
            if (comp < 0)
                continue;
            const s = stats[comp];
            s.area += 1;
            if (x < s.bbox.x)
                s.bbox.x = x;
            if (y < s.bbox.y)
                s.bbox.y = y;
            const right = x + 1;
            const bottom = y + 1;
            if (right > s.bbox.x + s.bbox.w)
                s.bbox.w = right - s.bbox.x;
            if (bottom > s.bbox.y + s.bbox.h)
                s.bbox.h = bottom - s.bbox.y;
        }
    }
    return stats;
}
function computeComponentChromaMeans(compLabels, aMap, bMap, compCount, cols, rows) {
    const sumA = new Float64Array(compCount);
    const sumB = new Float64Array(compCount);
    const counts = new Float64Array(compCount);
    const pixelCount = cols * rows;
    for (let i = 0; i < pixelCount; i++) {
        const comp = compLabels[i];
        if (comp < 0)
            continue;
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
        }
        else {
            meanA[c] = 128;
            meanB[c] = 128;
        }
    }
    return { meanA, meanB };
}
function mergeSmallComponents(compLabels, stats, aMap, bMap, cols, rows, minArea, distSqThreshold, neutralChromaMax) {
    const compCount = stats.length;
    const { meanA, meanB } = computeComponentChromaMeans(compLabels, aMap, bMap, compCount, cols, rows);
    const adjacency = new Map();
    const addEdge = (a, b) => {
        if (a === b || a < 0 || b < 0)
            return;
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
            if (a < 0)
                continue;
            if (x + 1 < cols) {
                const b = compLabels[i + 1];
                if (b >= 0)
                    addEdge(a, b);
            }
            if (y + 1 < rows) {
                const b = compLabels[i + cols];
                if (b >= 0)
                    addEdge(a, b);
            }
        }
    }
    const remap = new Int32Array(compCount);
    for (let i = 0; i < compCount; i++)
        remap[i] = i;
    const find = (x) => {
        while (remap[x] !== x) {
            remap[x] = remap[remap[x]];
            x = remap[x];
        }
        return x;
    };
    const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra === rb)
            return;
        const areaA = stats[ra].area;
        const areaB = stats[rb].area;
        if (areaA >= areaB) {
            remap[rb] = ra;
            stats[ra].area += stats[rb].area;
            stats[rb].area = 0;
        }
        else {
            remap[ra] = rb;
            stats[rb].area += stats[ra].area;
            stats[ra].area = 0;
        }
    };
    for (let c = 0; c < compCount; c++) {
        if (stats[c].area >= minArea)
            continue;
        const neighbors = adjacency.get(c);
        if (!neighbors || neighbors.size === 0)
            continue;
        let bestNeighbor = -1;
        let bestBorder = 0;
        for (const [nb, border] of neighbors) {
            if (border > bestBorder) {
                bestBorder = border;
                bestNeighbor = nb;
            }
        }
        if (bestNeighbor >= 0) {
            if (!canMergeWallPixels(meanA[c], meanB[c], meanA[bestNeighbor], meanB[bestNeighbor], distSqThreshold, neutralChromaMax)) {
                continue;
            }
            union(c, bestNeighbor);
        }
    }
    const pixelCount = cols * rows;
    for (let i = 0; i < pixelCount; i++) {
        const c = compLabels[i];
        if (c < 0)
            continue;
        compLabels[i] = find(c);
    }
}
function relabelComponentsContiguous(compLabels, cols, rows) {
    const pixelCount = cols * rows;
    const remap = new Map();
    const out = new Int32Array(pixelCount);
    out.fill(-1);
    for (let i = 0; i < pixelCount; i++) {
        const c = compLabels[i];
        if (c < 0)
            continue;
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
function buildPickMapAfterWallSplit(labels, baseboardBinary, wallIdx, wallSubLabels, indexToName, nameToId, cols, rows) {
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
        if (labels[i] === wallIdx && wallSubLabels[i] !== WALL_SUB_LABEL_NONE) {
            const wallName = `wall-${wallSubLabels[i] + 1}`;
            const regionId = nameToId.get(wallName);
            if (regionId !== undefined) {
                pick[i] = regionId + 1;
            }
            continue;
        }
        const semanticIndex = labels[i];
        if (semanticIndex === 255)
            continue;
        const name = indexToName[semanticIndex];
        if (!name)
            continue;
        const regionId = nameToId.get(name);
        if (regionId !== undefined) {
            pick[i] = regionId + 1;
        }
    }
    return pick;
}
function dilatePickBuffer1px(pick, cols, rows) {
    const pixelCount = cols * rows;
    const dst = new Uint8Array(pixelCount);
    dst.set(pick);
    for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
            const i = y * cols + x;
            if (pick[i] !== 0)
                continue;
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
            const counts = {};
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
/**
 * 在语义分割完成后，将 wall 区域按原图纹理特征细分为 wall-1、wall-2…
 */
export function splitWallRegionsByTexture(result, originBgr, cols, rows, minArea) {
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
    const { aMap: rawA, bMap: rawB } = computeLabChromaMaps(originBgr, cols, rows);
    const distSqThreshold = cfg.splitWallsColorDistSq;
    const neutralChromaMax = cfg.splitWallsNeutralChromaMax;
    const minAreaFloor = Math.max(minArea, Math.floor(cols * rows * cfg.splitWallsMinAreaRatio));
    const { compLabels: rawCompLabels, compCount: rawCount } = labelWallComponents(labels, baseboardBinary, wallIdx, rawA, rawB, cols, rows, distSqThreshold, neutralChromaMax);
    if (rawCount === 0) {
        return result;
    }
    let stats = computeComponentStats(rawCompLabels, rawCount, cols, rows);
    mergeSmallComponents(rawCompLabels, stats, rawA, rawB, cols, rows, minAreaFloor, distSqThreshold, neutralChromaMax);
    const { labels: finalCompLabels, compCount, stats: finalStats } = relabelComponentsContiguous(rawCompLabels, cols, rows);
    if (compCount === 0) {
        return result;
    }
    // 按面积降序，截断至 maxCount
    const ranked = finalStats
        .map((s, idx) => ({ ...s, origIdx: idx }))
        .filter(s => s.area > 0)
        .sort((a, b) => b.area - a.area)
        .slice(0, cfg.splitWallsMaxCount);
    const rankMap = new Map();
    ranked.forEach((s, rank) => {
        rankMap.set(s.origIdx, rank);
    });
    const wallSubLabels = new Uint8Array(pixelCount);
    wallSubLabels.fill(WALL_SUB_LABEL_NONE);
    for (let i = 0; i < pixelCount; i++) {
        const c = finalCompLabels[i];
        if (c < 0)
            continue;
        const rank = rankMap.get(c);
        if (rank === undefined)
            continue;
        wallSubLabels[i] = rank;
    }
    const wallRef = getSemanticColorByName('wall');
    const wallHex = wallRef?.hex ?? wallRegion.hex;
    const wallColor = wallRef?.bgr ?? wallRegion.color;
    const nonWallRegions = regions.filter(reg => reg.name !== 'wall');
    const wallSubRegions = ranked.map((s, rank) => {
        const bbox = s.bbox;
        const poly = bboxToPolygon(bbox);
        return {
            id: 0,
            name: `wall-${rank + 1}`,
            hex: wallHex,
            color: { ...wallColor },
            polygons: [poly],
            outlinePolygons: [poly],
            bbox,
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
    const pickRaw = buildPickMapAfterWallSplit(labels, baseboardBinary, wallIdx, wallSubLabels, indexToName, nameToId, cols, rows);
    const pickBuffer = dilatePickBuffer1px(pickRaw, cols, rows);
    for (const reg of mergedRegions) {
        if (!/^wall-\d+$/.test(reg.name))
            continue;
        const subIdx = Number(reg.name.slice(5)) - 1;
        let area = 0;
        for (let i = 0; i < pixelCount; i++) {
            if (wallSubLabels[i] === subIdx)
                area += 1;
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
export function isWallSubRegionName(name) {
    return /^wall-\d+$/.test(name);
}
//# sourceMappingURL=wallTextureSplit.js.map