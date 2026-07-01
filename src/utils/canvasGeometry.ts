import { Skia, type SkImage } from '@shopify/react-native-skia';
import type { SegmentRegion } from './maskSegmentation';
import { isBaseboardMaskPixel } from './maskSegmentation';
import { getMaskSegmentRuntimeConfig } from './maskSegmentRuntime';
import { resizeBgrBuffer } from './pngImage';
import type { BgrColor } from '../components/MaskSegmentCanvas.types';

/* ==========================================================================
 * 类型
 * ========================================================================== */
export type PaintResourceLayers = {
  lowFreqImage: SkImage;
  highFreqImage: SkImage;
};

export type ContainRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type WorkScaledBgr = {
  buffer: Uint8Array;
  cols: number;
  rows: number;
};

/* ==========================================================================
 * 颜色工具
 * ========================================================================== */
export function bgrColorEquals(a: BgrColor, b: BgrColor): boolean {
  return a.b === b.b && a.g === b.g && a.r === b.r;
}

/* ==========================================================================
 * 几何工具
 * ========================================================================== */
export function rectsEqual(a: ContainRect, b: ContainRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function getContainRect(
  canvasW: number,
  canvasH: number,
  imgW: number,
  imgH: number,
): ContainRect {
  const imgAspect = imgW / imgH;
  const canvasAspect = canvasW / canvasH;

  if (imgAspect > canvasAspect) {
    const w = canvasW;
    const h = canvasW / imgAspect;
    return { x: 0, y: (canvasH - h) / 2, w, h };
  }

  const h = canvasH;
  const w = canvasH * imgAspect;
  return { x: (canvasW - w) / 2, y: 0, w, h };
}

export function canvasToNormalized(
  cx: number,
  cy: number,
  canvasW: number,
  canvasH: number,
  imgW: number,
  imgH: number,
): { x: number; y: number } | null {
  const rect = getContainRect(canvasW, canvasH, imgW, imgH);
  if (
    cx < rect.x ||
    cx > rect.x + rect.w ||
    cy < rect.y ||
    cy > rect.y + rect.h
  ) {
    return null;
  }
  return {
    x: (cx - rect.x) / rect.w,
    y: (cy - rect.y) / rect.h,
  };
}

/** Skia matrix: pan → scale around viewport center. Matches screenToCanvasCoords. */
export function buildZoomPanMatrix(
  panX: number,
  panY: number,
  scale: number,
  canvasW: number,
  canvasH: number,
) {
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const m = Skia.Matrix();
  m.translate(panX, panY);
  m.translate(cx, cy);
  m.scale(scale, scale);
  m.translate(-cx, -cy);
  return m;
}

/** Clamp pan so scaled containRect does not expose empty margins beyond the viewport. */
export function clampPanOffset(
  pan: { x: number; y: number },
  scale: number,
  canvasW: number,
  canvasH: number,
  containRect: ContainRect | null,
): { x: number; y: number } {
  if (!containRect || scale <= 1 || canvasW <= 0 || canvasH <= 0) {
    return { x: 0, y: 0 };
  }

  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const r = containRect;

  const scaledMinX = cx + scale * (r.x - cx);
  const scaledMaxX = cx + scale * (r.x + r.w - cx);
  const scaledMinY = cy + scale * (r.y - cy);
  const scaledMaxY = cy + scale * (r.y + r.h - cy);

  let x = pan.x;
  let y = pan.y;

  if (scaledMaxX - scaledMinX > canvasW) {
    x = Math.max(canvasW - scaledMaxX, Math.min(-scaledMinX, x));
  } else {
    x = 0;
  }

  if (scaledMaxY - scaledMinY > canvasH) {
    y = Math.max(canvasH - scaledMaxY, Math.min(-scaledMinY, y));
  } else {
    y = 0;
  }

  return { x, y };
}

/**
 * Inverse of the Skia Group transform applied during pinch-zoom.
 * Converts a raw touch point (screen pixels) back to the canvas coordinate
 * space where the image and regions are positioned before any scale/pan.
 * When zoomScale ≤ 1 (no zoom), returns the input unchanged.
 */
export function screenToCanvasCoords(
  screenX: number,
  screenY: number,
  canvasW: number,
  canvasH: number,
  zoomScale: number,
  panOffset: { x: number; y: number },
): { x: number; y: number } {
  if (zoomScale <= 1) return { x: screenX, y: screenY };
  return {
    x: (screenX - panOffset.x - canvasW / 2) / zoomScale + canvasW / 2,
    y: (screenY - panOffset.y - canvasH / 2) / zoomScale + canvasH / 2,
  };
}

/* ==========================================================================
 * 点击检测
 * ========================================================================== */
export function pointInPolygon(
  x: number,
  y: number,
  points: { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygonWithPadding(
  x: number,
  y: number,
  points: { x: number; y: number }[],
  padding: number,
): boolean {
  if (points.length < 3) {
    return false;
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  if (
    x >= minX - padding &&
    x <= maxX + padding &&
    y >= minY - padding &&
    y <= maxY + padding
  ) {
    if (maxY - minY < padding * 2.5 || maxX - minX < padding * 2.5) {
      return true;
    }
  }

  return pointInPolygon(x, y, points);
}

export function getRegionHitPolygons(reg: SegmentRegion): { x: number; y: number }[][] {
  return reg.hitPolygons && reg.hitPolygons.length > 0
    ? reg.hitPolygons
    : reg.polygons;
}

export function pointHitsRegion(
  x: number,
  y: number,
  reg: SegmentRegion,
  options?: { thinPadding?: number },
): boolean {
  const interaction = getMaskSegmentRuntimeConfig().interaction;
  const thinPadding = options?.thinPadding ?? interaction.thinStripPadding;
  const padding = reg.thinStrip ? thinPadding : interaction.regionPadding;
  return getRegionHitPolygons(reg).some(
    poly => poly.length >= 3 && pointInPolygonWithPadding(x, y, poly, padding),
  );
}

export function pointStrictlyHitsRegion(x: number, y: number, reg: SegmentRegion): boolean {
  return getRegionHitPolygons(reg).some(
    poly => poly.length >= 3 && pointInPolygon(x, y, poly),
  );
}

export function resolveRegionHit(
  regions: SegmentRegion[],
  x: number,
  y: number,
): number | null {
  const hits: SegmentRegion[] = [];

  for (const reg of regions) {
    const bboxPad = reg.thinStrip ? 0.005 : 0;
    const b = reg.bbox;
    if (
      x < b.x - bboxPad ||
      x > b.x + b.w + bboxPad ||
      y < b.y - bboxPad ||
      y > b.y + b.h + bboxPad
    ) {
      continue;
    }
    if (pointHitsRegion(x, y, reg)) {
      hits.push(reg);
    }
  }

  if (hits.length === 0) {
    return null;
  }
  if (hits.length === 1) {
    return hits[0].id;
  }

  const strictNonThin = hits.filter(
    reg => !reg.thinStrip && pointStrictlyHitsRegion(x, y, reg),
  );
  if (strictNonThin.length > 0) {
    strictNonThin.sort((a, b) => a.area - b.area);
    return strictNonThin[0].id;
  }

  const strictThin = hits.filter(
    reg => reg.thinStrip && pointStrictlyHitsRegion(x, y, reg),
  );
  if (strictThin.length > 0) {
    strictThin.sort((a, b) => a.area - b.area);
    return strictThin[0].id;
  }

  const nonThin = hits.filter(reg => !reg.thinStrip);
  if (nonThin.length > 0) {
    nonThin.sort((a, b) => a.area - b.area);
    return nonThin[0].id;
  }

  hits.sort((a, b) => a.area - b.area);
  return hits[0].id;
}

/* ==========================================================================
 * 踢脚线/掩码拾取
 * ========================================================================== */
export function pickKickRegionFromMask(
  normX: number,
  normY: number,
  pick: { buffer: Uint8Array; cols: number; rows: number },
  kickRegionId: number,
  baseboardPickMask?: Uint8Array | null,
  strict = false,
): number | null {
  const cx = Math.floor(normX * pick.cols);
  const cy = Math.floor(normY * pick.rows);
  if (cx < 0 || cy < 0 || cx >= pick.cols || cy >= pick.rows) {
    return null;
  }

  if (strict) {
    if (baseboardPickMask) {
      return baseboardPickMask[cy * pick.cols + cx] ? kickRegionId : null;
    }
    return isBaseboardMaskPixel(pick.buffer, pick.cols, pick.rows, cx, cy)
      ? kickRegionId
      : null;
  }

  const interaction = getMaskSegmentRuntimeConfig().interaction;
  const radius = Math.max(
    interaction.kickMaskPickRadiusPx,
    Math.floor(pick.cols * 0.022),
  );
  const radiusSq = radius * radius;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radiusSq) {
        continue;
      }
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= pick.cols || y >= pick.rows) {
        continue;
      }
      if (baseboardPickMask) {
        if (baseboardPickMask[y * pick.cols + x]) {
          return kickRegionId;
        }
        continue;
      }
      if (
        isBaseboardMaskPixel(
          pick.buffer,
          pick.cols,
          pick.rows,
          x,
          y,
        )
      ) {
        return kickRegionId;
      }
    }
  }

  return null;
}

export function pickKickNearStrip(
  normX: number,
  normY: number,
  kickReg: SegmentRegion,
): boolean {
  const polys = kickReg.hitPolygons ?? kickReg.polygons;
  const pad = getMaskSegmentRuntimeConfig().interaction.thinStripPadding + 0.004;
  return polys.some(
    poly =>
      poly.length >= 3 && pointInPolygonWithPadding(normX, normY, poly, pad),
  );
}

export function lookupRegionFromPickMap(
  normX: number,
  normY: number,
  pick: { buffer: Uint8Array; cols: number; rows: number },
  radiusPx = getMaskSegmentRuntimeConfig().interaction.pickMapSearchRadiusPx,
): number | null {
  const cx = Math.min(
    pick.cols - 1,
    Math.max(0, Math.floor(normX * pick.cols)),
  );
  const cy = Math.min(
    pick.rows - 1,
    Math.max(0, Math.floor(normY * pick.rows)),
  );

  const readCode = (x: number, y: number) => pick.buffer[y * pick.cols + x];

  const center = readCode(cx, cy);
  if (center > 0) {
    return center - 1;
  }

  if (radiusPx <= 0) {
    return null;
  }

  const r = Math.max(4, radiusPx);
  const rSq = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > rSq) {
        continue;
      }
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= pick.cols || y >= pick.rows) {
        continue;
      }
      const code = readCode(x, y);
      if (code > 0) {
        return code - 1;
      }
    }
  }

  return null;
}

/* ==========================================================================
 * 资源释放
 * ========================================================================== */
export function releasePaintResourceLayers(layers: PaintResourceLayers | null) {
  if (!layers) {
    return;
  }
  layers.lowFreqImage.dispose();
  layers.highFreqImage.dispose();
}

export function releaseOriginSkImage(image: SkImage | null) {
  if (image) {
    image.dispose();
  }
}

/* ==========================================================================
 * 工作缓冲区缩放
 * ========================================================================== */
export async function prepareWorkScaledBgrBuffer(
  bgrBuffer: Uint8Array,
  cols: number,
  rows: number,
  workScale: number,
): Promise<WorkScaledBgr> {
  if (workScale >= 1) {
    return { buffer: bgrBuffer, cols, rows };
  }
  const workCols = Math.floor(cols * workScale);
  const workRows = Math.floor(rows * workScale);
  const buffer = resizeBgrBuffer(bgrBuffer, cols, rows, workCols, workRows);
  return { buffer, cols: workCols, rows: workRows };
}

/* ==========================================================================
 * 分段计时工具（仅开发环境生效）
 * ========================================================================== */
let _timeLogTs = 0;
export function timeLog(tag: string) {
  if (!__DEV__) return;
  const now = performance.now();
  const dt = _timeLogTs ? now - _timeLogTs : 0;
  console.log(`[⏱ ${tag}] ${dt.toFixed(2)} ms`);
  _timeLogTs = now;
}
