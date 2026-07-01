import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import cv from '../utils/opencvAdapter';
import {
  buildAllRegionOutlinePaths,
  buildRegionOutlinePathForRegion,
  downsampleMaskDataForPaths,
  extractRegionsFromMaskBufferSync,
  isBaseboardMaskPixel,
  upscaleBinaryMask,
  type RegionMaskData,
  type SegmentRegion,
} from '../utils/maskSegmentation';
import { splitWallRegionsByTexture } from '../utils/wallTextureSplit';
import {
  clearDerivedImageCache,
  readPngBgrBuffer,
  prewarmPngBgrCache,
  resizeBgrBuffer,
} from '../utils/pngImage';
import { hashUrl, resolveImageUrl } from '../utils/resolveImageUrl';
import { compositePaintedImage } from '../utils/compositePaintedImage';
import {
  paintedRegionsFingerprint,
  resolveExportResultForDestDir,
} from '../utils/exportUtils';
import {
  preparePaintResourcesFromWorkBuffer,
  releaseFreqLayerImages,
} from '../utils/freqLayerPrep';
import {
  PaintShaderLayer,
  createPaintColorMapForPaint,
} from '../utils/paintShaderRuntime';
import {
  createRuntimeConfig,
  getMaskRuntimeRevision,
  getMaskSegmentRuntimeConfig,
  resolvePipelineConfig,
  setMaskSegmentRuntimeConfig,
} from '../utils/maskSegmentRuntime';
import type {
  BgrColor,
  MaskSegmentCanvasProps,
  MaskSegmentCanvasRef,
  MaskSegmentSession,
  MaskSegmentWatchDetail,
  MaskSegmentWatchState,
  PaintedRegionRecord,
  SavePaintResult,
} from './MaskSegmentCanvas.types';
import {
  Canvas,
  Image as SkiaImage,
  Path,
  Group,
  DashPathEffect,
  Rect,
  useCanvasRef,
  Skia,
  type SkImage,
  type SkPath,
} from '@shopify/react-native-skia';

export type {
  MaskSegmentCanvasProps,
  MaskSegmentCanvasRef,
  MaskSegmentSession,
  MaskSegmentWatchState,
  PaintedRegionRecord,
  BgrColor,
  MaskSemanticColor,
} from './MaskSegmentCanvas.types';

/* ==========================================================================
 * 类型
 * ========================================================================== */
type PaintResourceLayers = {
  lowFreqImage: SkImage;
  highFreqImage: SkImage;
};

type ContainRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

function bgrColorEquals(a: BgrColor, b: BgrColor): boolean {
  return a.b === b.b && a.g === b.g && a.r === b.r;
}

/* ==========================================================================
 * 几何工具
 * ========================================================================== */
function rectsEqual(a: ContainRect, b: ContainRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function getContainRect(
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

function canvasToNormalized(
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
function buildZoomPanMatrix(
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
function clampPanOffset(
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
function screenToCanvasCoords(
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

function pointInPolygon(
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

function pointInPolygonWithPadding(
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

function getRegionHitPolygons(reg: SegmentRegion): { x: number; y: number }[][] {
  return reg.hitPolygons && reg.hitPolygons.length > 0
    ? reg.hitPolygons
    : reg.polygons;
}

function pointHitsRegion(
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

function pointStrictlyHitsRegion(x: number, y: number, reg: SegmentRegion): boolean {
  return getRegionHitPolygons(reg).some(
    poly => poly.length >= 3 && pointInPolygon(x, y, poly),
  );
}

function resolveRegionHit(
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

function pickKickRegionFromMask(
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

function pickKickNearStrip(
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

function lookupRegionFromPickMap(
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

function releasePaintResourceLayers(layers: PaintResourceLayers | null) {
  if (!layers) {
    return;
  }
  layers.lowFreqImage.dispose();
  layers.highFreqImage.dispose();
}

function releaseOriginSkImage(image: SkImage | null) {
  if (image) {
    image.dispose();
  }
}

type WorkScaledBgr = {
  buffer: Uint8Array;
  cols: number;
  rows: number;
};

async function prepareWorkScaledBgrBuffer(
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
function timeLog(tag: string) {
  if (!__DEV__) return;
  const now = performance.now();
  const dt = _timeLogTs ? now - _timeLogTs : 0;
  console.log(`[⏱ ${tag}] ${dt.toFixed(2)} ms`);
  _timeLogTs = now;
}

/* ==========================================================================
 * 组件主体
 * ========================================================================== */
const MaskSegmentCanvas = forwardRef<MaskSegmentCanvasRef, MaskSegmentCanvasProps>(
  function MaskSegmentCanvas(props, ref) {
  const {
    originUrl: originUrlProp,
    maskUrl: maskUrlProp,
    originImgPath: originImgPathLegacy,
    maskImgPath: maskImgPathLegacy,
    maskConfig,
    pipelinePreset,
    pipelineConfig,
    paintConfig,
    interactionConfig,
    semanticColors,
    regionOutlineColor,
    initialSession,
    initialPaintColor,
    initialPaintConfigJson,
    disabled = false,
    style,
    onWatch,
    onPaintCallback,
    onError,
    autoExportOnReady,
    onExported,
  } = props;

  const originSource = originUrlProp ?? originImgPathLegacy ?? '';
  const maskSource = maskUrlProp ?? maskImgPathLegacy ?? '';

  const resolvedMaskConfig = useMemo(
    () =>
      semanticColors
        ? { ...maskConfig, semanticColors }
        : maskConfig,
    [maskConfig, semanticColors],
  );

  const resolvedPaintConfig = useMemo(
    () =>
      regionOutlineColor
        ? { ...paintConfig, regionOverlayFill: regionOutlineColor }
        : paintConfig,
    [paintConfig, regionOutlineColor],
  );

  const [resolvedOriginPath, setResolvedOriginPath] = useState('');
  const [resolvedMaskPath, setResolvedMaskPath] = useState('');
  const [originImgPath, setOriginImgPath] = useState(resolvedOriginPath);
  const [maskImgPath, setMaskImgPath] = useState(resolvedMaskPath);

  // Latest desired image paths (updated when the internal path states settle).
  // Used by segmentAndPrepareLayers to decide whether a stale runId (from effect cleanup due to
  // unrelated parent re-renders) should actually abort the current async read/segment work.
  // If the image pair we are processing is still the one the caller ultimately wants, we continue.
  const latestOriginPathRef = useRef<string>('');
  const latestMaskPathRef = useRef<string>('');

  const resolvedPipelineConfig = useMemo(
    () => resolvePipelineConfig(pipelinePreset, pipelineConfig),
    [pipelinePreset, pipelineConfig],
  );

  const runtimeRef = useRef(createRuntimeConfig({
    maskConfig: resolvedMaskConfig,
    pipelineConfig: resolvedPipelineConfig,
    paintConfig: resolvedPaintConfig,
    interactionConfig,
  }));

  // Track last *values* we pushed for paintConfig. We only call the global setMaskSegmentRuntimeConfig
  // (which bumps runtimeRevision) when the actual numbers change. This prevents repeated parent
  // re-renders that pass a new object literal with identical values from causing:
  //   - global revision bump
  //   - paintColorMap useMemo invalidation (full-res Uint8Array + boxBlur + Skia image alloc)
  //   - extra main-thread work during the critical segmentation / freq-layers / outline paths window.
  // The local runtimeRef is still kept in sync for any synchronous readers.
  const lastAppliedPaintConfigRef = useRef<Record<string, unknown> | null>(null);
  const lastAppliedPipelineSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    const prevPaint = lastAppliedPaintConfigRef.current;
    const currPaint = resolvedPaintConfig || {};
    const paintKeys = [
      'colorBaseOpacity',
      'lLightOpacity',
      'textureOpacity',
      'lLowBlurKernel',
      'lLowContrast',
      'lLowBrightness',
      'lHighGain',
      'maskFeatherColor',
      'maskFeatherTexture',
      'regionOverlayFill',
    ] as const;
    const paintChanged =
      !prevPaint || paintKeys.some((k) => (currPaint as any)[k] !== (prevPaint as any)[k]);

    const pipelineSignature = JSON.stringify(resolvedPipelineConfig);
    const pipelineChanged =
      lastAppliedPipelineSignatureRef.current !== pipelineSignature;

    if (paintChanged || pipelineChanged) {
      if (paintChanged) {
        lastAppliedPaintConfigRef.current = { ...currPaint };
      }
      if (pipelineChanged) {
        lastAppliedPipelineSignatureRef.current = pipelineSignature;
      }
      runtimeRef.current = setMaskSegmentRuntimeConfig({
        maskConfig: resolvedMaskConfig,
        pipelineConfig: resolvedPipelineConfig,
        paintConfig: resolvedPaintConfig,
        interactionConfig,
      });
    }
  }, [
    resolvedMaskConfig,
    resolvedPipelineConfig,
    resolvedPaintConfig,
    interactionConfig,
  ]);

  const paintPalette = runtimeRef.current.paint.palette;
  const paintRuntime = getMaskSegmentRuntimeConfig().paint;
  const interactionRuntime = getMaskSegmentRuntimeConfig().interaction;

  const onWatchRef = useRef(onWatch);
  const onPaintCallbackRef = useRef(onPaintCallback);
  const onErrorRef = useRef(onError);
  const onExportedRef = useRef(onExported);
  useEffect(() => {
    onWatchRef.current = onWatch;
    onPaintCallbackRef.current = onPaintCallback;
    onErrorRef.current = onError;
    onExportedRef.current = onExported;
  }, [onWatch, onPaintCallback, onError, onExported]);

  const watchStartRef = useRef(0);
  const lastWatchStateRef = useRef<MaskSegmentWatchState | null>(null);
  const lastWatchSignatureRef = useRef<string | null>(null);

  const emitWatch = useCallback(
    (state: MaskSegmentWatchState, detail?: MaskSegmentWatchDetail) => {
      const signature = [
        state,
        detail?.regionCount ?? '',
        detail?.maskPathsReady ?? '',
        detail?.freqLayersReady ?? '',
        detail?.errorMessage ?? '',
      ].join('|');
      if (lastWatchSignatureRef.current === signature) {
        return;
      }
      lastWatchSignatureRef.current = signature;
      lastWatchStateRef.current = state;
      const durationMs = watchStartRef.current
        ? performance.now() - watchStartRef.current
        : 0;
      onWatchRef.current?.(state, durationMs, detail);
    },
    [],
  );

  const reportError = useCallback((message: string, error?: unknown) => {
    emitWatch('error', { errorMessage: message });
    if (onErrorRef.current) {
      onErrorRef.current(message, error);
    } else if (__DEV__) {
      console.error('[MaskSegment]', message, error);
    }
  }, [emitWatch]);

  const [customPaintColor, setCustomPaintColor] = useState<BgrColor | null>(
    initialPaintColor ?? null,
  );
  const customPaintConfigJsonRef = useRef<Record<string, unknown> | undefined>(
    initialPaintConfigJson,
  );
  const originUrlRef = useRef(originSource);
  const maskUrlRef = useRef(maskSource);

  useEffect(() => {
    originUrlRef.current = originSource;
    maskUrlRef.current = maskSource;
  }, [originSource, maskSource]);

  useEffect(() => {
    let cancelled = false;
    if (!originSource || !maskSource) {
      setResolvedOriginPath('');
      setResolvedMaskPath('');
      return;
    }

    void (async () => {
      try {
        const [originPath, maskPath] = await Promise.all([
          resolveImageUrl(originSource, `origin_${hashUrl(originSource)}.png`),
          resolveImageUrl(maskSource, `mask_${hashUrl(maskSource)}.png`),
        ]);
        if (!cancelled) {
          setResolvedOriginPath(originPath);
          setResolvedMaskPath(maskPath);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          reportError(msg, e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [originSource, maskSource, reportError]);

  useEffect(() => {
    setOriginImgPath(resolvedOriginPath);
    setMaskImgPath(resolvedMaskPath);
    if (resolvedOriginPath && resolvedMaskPath) {
      prewarmPngBgrCache([resolvedOriginPath, resolvedMaskPath]);
    }
  }, [resolvedOriginPath, resolvedMaskPath]);

  // Keep latest desired paths for cancellation decisions inside the long async segment pipeline.
  useEffect(() => {
    latestOriginPathRef.current = originImgPath || '';
    latestMaskPathRef.current = maskImgPath || '';
  }, [originImgPath, maskImgPath]);

  const [paintResourceLayers, setPaintResourceLayers] =
    useState<PaintResourceLayers | null>(null);
  const paintResourceLayersRef = useRef<PaintResourceLayers | null>(null);
  const paintColorMapSkImgRef = useRef<SkImage | null>(null);

  const [activeBrushIndex, setActiveBrushIndex] = useState<number | null>(null);
  const [paintedRegions, setPaintedRegions] = useState<Map<number, BgrColor>>(
    () => new Map(),
  );
  const paintedRegionsRef = useRef<Map<number, BgrColor>>(new Map());
  const [paintHistory, setPaintHistory] = useState<number[]>([]);

  // Seed the ref with the initial empty map so early reads (before any paint effect)
  // are consistent.
  paintedRegionsRef.current = paintedRegions;
  const [heldRegionId, setHeldRegionId] = useState<number | null>(null);
  const [heldRegionAnchor, setHeldRegionAnchor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [initFlashRegionId, setInitFlashRegionId] = useState<number | null>(null);
  const initFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initFlashIndexRef = useRef(0);
  const initFlashActiveRef = useRef(false);
  // List of regions still eligible for the init dashed-outline flash (discovery aid).
  // Computed at the start of the flash loop, excluding any that are already painted.
  // This ensures that on continue-edit (or any partial seed), already-colored regions
  // do not get the flashing dashed outline.
  const initFlashListRef = useRef<SegmentRegion[]>([]);
  // Guard so that initialSession (seed from host bootstrap or scheme) is applied only once
  // after segmentsReady. Prevents later prop identity changes (e.g. caused by host slot/brush
  // selection re-renders) from calling restoreSession again, which would clobber live
  // paintedRegions with a re-derived snapshot (often causing already-painted regions to
  // "follow" the newly selected brush color).
  const hasAppliedInitialSessionRef = useRef(false);

  // Keep a ref to the absolute latest paintedRegions so that imperative save()
  // (called from host performSaveProject for new schemes, or manually) and
  // internal composites always see the most up-to-date painted state, even
  // if the useImperativeHandle closure was created in a prior render.
  // This fixes cases where the last user paint's colors were missing from
  // the recolored After image captured at "save scheme" time.
  useEffect(() => {
    paintedRegionsRef.current = paintedRegions;
  }, [paintedRegions]);

  // Cached export from the most recent auto-export or save() — keyed by painted fingerprint.
  const lastExportCacheRef = useRef<{ fingerprint: string; result: SavePaintResult } | null>(null);
  const autoExportDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportInFlightRef = useRef(false);

  const regionsRef = useRef<SegmentRegion[]>([]);
  const maskPickRef = useRef<{
    buffer: Uint8Array;
    cols: number;
    rows: number;
  } | null>(null);
  const regionPickRef = useRef<{
    buffer: Uint8Array;
    cols: number;
    rows: number;
  } | null>(null);
  const regionMaskDataRef = useRef<RegionMaskData | null>(null);
  const workBufferRef = useRef<WorkScaledBgr | null>(null);
  const paintLayersPromiseRef = useRef<Promise<void> | null>(null);
  const loadPaintLayersRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const [paintResourcesReady, setPaintResourcesReady] = useState(false);
  const [maskPathsReady, setMaskPathsReady] = useState(false);
  const baseboardPickMaskRef = useRef<Uint8Array | null>(null);
  const kickRegionIdRef = useRef<number | null>(null);
  const [regionPalette, setRegionPalette] = useState<SegmentRegion[]>([]);
  const [regionCount, setRegionCount] = useState(0);

  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(
    null,
  );

  // High-resolution offscreen Canvas (sized to the work buffer resolution) whose content
  // is the full shader composition (PaintShaderLayer at 0,0,workW,workH). On save() we
  // call makeImageSnapshot() on it to get a "what you see in the editor, at source res"
  // PNG bytes. This is the preferred "保存快照" path and avoids CPU recolor entirely
  // for the exported After.
  const highResExportCanvasRef = useCanvasRef();
  const [exportCanvasSize, setExportCanvasSize] = useState<{ w: number; h: number } | null>(null);
  // Gate the (potentially expensive) high-res snapshot canvas so it is only mounted
  // after the user (or initialSession seed) has painted at least one region. This keeps
  // idle segmentation / no-paint cases cheap.
  const [highResSnapshotEnabled, setHighResSnapshotEnabled] = useState(false);

  // Viewport measured from canvasWrap onLayout — single source of truth for Skia,
  // gestures, containRect, and pan clamp (must match the actual touch target).
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number } | null>(null);

  const [segmentsReady, setSegmentsReady] = useState(false);
  const segmentsReadyRef = useRef(false);
  const maskPathsReadyRef = useRef(false);
  const [canvasInteractive, setCanvasInteractive] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const resegmentInFlightRef = useRef(false);

  const [originSkImg, setOriginSkImg] = useState<SkImage | null>(null);
  const originSkImgRef = useRef<SkImage | null>(null);
  const lowFreqSkImg = paintResourceLayers?.lowFreqImage ?? null;
  const highFreqSkImg = paintResourceLayers?.highFreqImage ?? null;

  const canvasW = viewportSize?.w ?? 1;
  const canvasH = viewportSize?.h ?? 1;
  const canvasLayoutReady =
    viewportSize != null && viewportSize.w > 0 && viewportSize.h > 0;

  // Refs synced to the latest viewport size so async callbacks read post-layout values.
  const canvasWRef = useRef(canvasW);
  const canvasHRef = useRef(canvasH);

  // ── Pinch-zoom (focal-point) + single-finger pan when zoomed ─────────────
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // Refs for gesture callbacks (closures don't capture fresh state mid-gesture)
  const zoomScaleRef = useRef(1);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const pinchBaseScaleRef = useRef(1);
  const pinchBasePanRef = useRef({ x: 0, y: 0 });
  const pinchBaseFocalRef = useRef({ x: 0, y: 0 });
  const panBaseRef = useRef({ x: 0, y: 0 });
  // Ref to the latest containRect (the actual placed photo rect inside the viewport).
  const containRectRef = useRef<ContainRect | null>(null);

  useEffect(() => { zoomScaleRef.current = zoomScale; }, [zoomScale]);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);

  const handleCanvasWrapLayout = useCallback((width: number, height: number) => {
    if (width <= 0 || height <= 0) {
      return;
    }
    canvasWRef.current = width;
    canvasHRef.current = height;
    setViewportSize(prev => {
      if (prev?.w === width && prev?.h === height) {
        return prev;
      }
      return { w: width, h: height };
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    zoomScaleRef.current = 1;
    panOffsetRef.current = { x: 0, y: 0 };
  }, []);

  const containRect = useMemo(() => {
    if (!imageSize) return null;
    return getContainRect(canvasW, canvasH, imageSize.w, imageSize.h);
  }, [imageSize, canvasW, canvasH]);

  // Keep a ref in sync so early-defined callbacks can read the
  // latest containRect without TDZ or stale closure issues.
  useEffect(() => {
    containRectRef.current = containRect;
  }, [containRect]);

  const segmentRunIdRef = useRef(0);
  const lastSegmentKeyRef = useRef('');
  const segmentInFlightKeyRef = useRef('');
  const maskPathsContainRectRef = useRef<ContainRect | null>(null);

  useEffect(() => {
    paintResourceLayersRef.current = paintResourceLayers;
  }, [paintResourceLayers]);

  useEffect(() => {
    segmentsReadyRef.current = segmentsReady;
  }, [segmentsReady]);

  useEffect(() => {
    maskPathsReadyRef.current = maskPathsReady;
  }, [maskPathsReady]);

  const emitLayersReadyIfReady = useCallback(() => {
    if (!segmentsReadyRef.current || !paintResourceLayersRef.current) {
      return;
    }
    emitWatch('layers_ready', {
      regionCount: regionsRef.current.length,
      maskPathsReady: maskPathsReadyRef.current,
      freqLayersReady: true,
    });
  }, [emitWatch]);

  const emitMaskPathsReadyIfReady = useCallback(() => {
    if (!segmentsReadyRef.current || !maskPathsReadyRef.current) {
      return;
    }
    emitWatch('mask_paths_ready', {
      regionCount: regionsRef.current.length,
      maskPathsReady: true,
      freqLayersReady: true,
    });
  }, [emitWatch]);

  const emitInteractiveIfReady = useCallback(() => {
    if (!segmentsReadyRef.current || !paintResourceLayersRef.current) {
      return;
    }
    emitLayersReadyIfReady();
    emitWatch('interactive', {
      regionCount: regionsRef.current.length,
      maskPathsReady: maskPathsReadyRef.current,
      freqLayersReady: true,
    });
    setCanvasInteractive(true);
  }, [emitWatch, emitLayersReadyIfReady]);

  const paintColorMapSkImg = useMemo(() => {
    const pick = regionPickRef.current;
    paintColorMapSkImgRef.current?.dispose();
    // Early out: no pick buffer yet, or no regions have been painted (initial load or fresh session).
    // Avoids repeated full-resolution RGBA allocation + boxBlur (for maskFeather) + Skia.Image.MakeImage
    // on every re-render during the hot init path. When initialSession restores paints, paintedRegions
    // will update and legitimately trigger a single build of the (feathered) color map.
    if (!pick || paintedRegions.size === 0) {
      paintColorMapSkImgRef.current = null;
      return null;
    }
    const map = createPaintColorMapForPaint(
      pick.buffer,
      pick.cols,
      pick.rows,
      paintedRegions,
    );
    paintColorMapSkImgRef.current = map;
    return map;
  }, [paintedRegions, paintResourcesReady, segmentsReady, getMaskRuntimeRevision()]);

  const paintedRegionConfigRef = useRef(
    new Map<number, Record<string, unknown>>(),
  );

  const segmentAndPrepareLayers = useCallback(
    async (originPath: string, maskPath: string) => {
      const runId = ++segmentRunIdRef.current;
      // isCancelled: a runId bump alone is not enough to abort if the image pair we were asked to process
      // is still the latest desired pair from the caller (protects against effect cleanups caused by
      // unrelated parent re-renders / state updates that do not change the two images).
      const isCancelled = () => {
        if (runId === segmentRunIdRef.current) return false;
        const desiredOrigin = latestOriginPathRef.current || originPath;
        const desiredMask = latestMaskPathRef.current || maskPath;
        const stillWanted = desiredOrigin === originPath && desiredMask === maskPath;
        return !stillWanted;
      };
      const pipeline = getMaskSegmentRuntimeConfig().pipeline;


      watchStartRef.current = performance.now();
      lastWatchStateRef.current = null;
      lastWatchSignatureRef.current = null;
      emitWatch('init');

      timeLog('▶ start segmentation');
      segmentsReadyRef.current = false;
      setSegmentsReady(false);
      setActiveBrushIndex(null);
      const clearedPainted = new Map<number, BgrColor>();
      paintedRegionsRef.current = clearedPainted;
      setPaintedRegions(clearedPainted);
      setPaintHistory([]);
      setHeldRegionId(null);
      setHeldRegionAnchor(null);
      setInitFlashRegionId(null);
      initFlashActiveRef.current = false;
      initFlashIndexRef.current = 0;
      initFlashListRef.current = [];
      if (initFlashTimerRef.current) {
        clearTimeout(initFlashTimerRef.current);
        initFlashTimerRef.current = null;
      }
      hasAppliedInitialSessionRef.current = false;
      lastExportCacheRef.current = null;
      if (autoExportDebounceRef.current) {
        clearTimeout(autoExportDebounceRef.current);
        autoExportDebounceRef.current = null;
      }
      exportInFlightRef.current = false;
      regionsRef.current = [];
      maskPickRef.current = null;
      regionPickRef.current = null;
      regionMaskDataRef.current = null;
      workBufferRef.current = null;
      paintLayersPromiseRef.current = null;
      setRegionOutlinePaths(new Map());
      setMaskPathsReady(false);
      setPaintResourcesReady(false);
      baseboardPickMaskRef.current = null;
      kickRegionIdRef.current = null;
      maskPathsContainRectRef.current = null;
      setRegionPalette([]);
      setRegionCount(0);
      // Reset high-res snapshot state so a fresh segmentation starts clean (no stale size/ref).
      setExportCanvasSize(null);
      setHighResSnapshotEnabled(false);

      const prevLayers = paintResourceLayersRef.current;
      if (prevLayers) {
        releasePaintResourceLayers(prevLayers);
        paintResourceLayersRef.current = null;
        setPaintResourceLayers(null);
      }
      releaseOriginSkImage(originSkImgRef.current);
      originSkImgRef.current = null;
      setOriginSkImg(null);

      try {
        timeLog('▶ reading origin PNG');
        const originPromise = readPngBgrBuffer(originPath);
        timeLog('▶ reading mask PNG');
        const maskPromise = readPngBgrBuffer(maskPath);

        const originDecoded = await originPromise;
        const afterOriginCancelled = isCancelled();
        if (afterOriginCancelled) {
          return;
        }

        const imgW = originDecoded.cols;
        const imgH = originDecoded.rows;
        setImageSize({ w: imgW, h: imgH });

        let scale = 1;
        if (Math.max(imgW, imgH) > pipeline.maxImageLongSide) {
          scale = pipeline.maxImageLongSide / Math.max(imgW, imgH);
        }
        const segW = Math.floor(imgW * scale);
        const segH = Math.floor(imgH * scale);
        const minArea = pipeline.minContourArea * scale * scale;

        const workScaledTask = prepareWorkScaledBgrBuffer(
          originDecoded.buffer,
          imgW,
          imgH,
          scale,
        ).then(workScaled => {
          if (isCancelled()) {
            return workScaled;
          }
          workBufferRef.current = workScaled;
          setExportCanvasSize({ w: workScaled.cols, h: workScaled.rows });
          // Enable the offscreen high-res export canvas as soon as we know the work resolution.
          // This gives the hidden <Canvas> time to mount and commit before autoExport/save()
          // tries to snapshot it. The inner renderFullResPainted() will draw cheap origin until
          // paints + shader textures are ready. This greatly increases the chance that the
          // preferred makeImageSnapshot path succeeds for rich exports (instead of falling
          // through to the drawAsImage reconstruction).
          setHighResSnapshotEnabled(true);
          void loadPaintLayersRef.current();
          return workScaled;
        });

        const segmentTask = maskPromise.then(async maskDecoded => {
          if (isCancelled()) {
            throw new Error('cancelled');
          }
          timeLog('▶ PNG read completed');
          emitWatch('images_loaded');
          timeLog(`▶ image size: ${imgW}x${imgH}`);

          const { buffer: maskBuffer, cols: maskW, rows: maskH } = maskDecoded;
          const segMaskBuffer = resizeBgrBuffer(
            maskBuffer,
            maskW,
            maskH,
            segW,
            segH,
          );
          timeLog(`▶ mask scale: ${scale.toFixed(3)}`);
          emitWatch('mask_aligned');
          return extractRegionsFromMaskBufferSync(segMaskBuffer, segW, segH, {
            minArea,
            approxEpsilon: pipeline.contourApproxEpsilon,
          });
        });

        void maskPromise.then(async maskDecoded => {
          const { buffer: maskBuffer, cols: maskW, rows: maskH } = maskDecoded;
          let pickBuffer: Uint8Array;
          if (maskW !== imgW || maskH !== imgH) {
            pickBuffer = await cv.resizeBgrBuffer(
              maskBuffer,
              maskW,
              maskH,
              imgW,
              imgH,
            );
          } else {
            pickBuffer = new Uint8Array(maskBuffer);
          }
          if (runId !== segmentRunIdRef.current) {
            return;
          }
          maskPickRef.current = {
            buffer: pickBuffer,
            cols: imgW,
            rows: imgH,
          };
        });

        const [segmentResultRaw, workScaled] = await Promise.all([
          segmentTask,
          workScaledTask,
        ]);
        if (isCancelled()) {
          return;
        }

        let segmentResult = segmentResultRaw;
        if (getMaskSegmentRuntimeConfig().mask.splitWalls) {
          segmentResult = splitWallRegionsByTexture(
            segmentResult,
            workScaled.buffer,
            segW,
            segH,
            minArea,
          );
        }
        const paintPromise =
          paintLayersPromiseRef.current ?? Promise.resolve();
        emitWatch('mask_sampled', { regionCount: segmentResult.regions.length });
        timeLog(`▶ segmentation completed, valid regions: ${segmentResult.regions.length}`);
        const validRegions = segmentResult.regions;
        if (__DEV__ && validRegions.length === 0) {
          console.warn(
            '[MaskSegment] not recognized any valid regions, please check if the mask is a pure color region image',
          );
        }

        let finalRegions = validRegions;
        if (finalRegions.length > pipeline.maxRegions) {
          finalRegions = finalRegions.slice(0, pipeline.maxRegions);
        }

        regionsRef.current = finalRegions;
        regionPickRef.current = segmentResult.pickMap;
        regionMaskDataRef.current = {
          labels: segmentResult.labels,
          baseboardBinary: segmentResult.baseboardBinary,
          cols: segmentResult.segCols,
          rows: segmentResult.segRows,
          wallSubLabels: segmentResult.wallSubLabels,
        };
        baseboardPickMaskRef.current = null;
        kickRegionIdRef.current =
          finalRegions.find(reg => reg.thinStrip)?.id ?? null;

        const pathMapRect = getContainRect(canvasWRef.current, canvasHRef.current, imgW, imgH);
        maskPathsContainRectRef.current = pathMapRect;
        setRegionOutlinePaths(new Map());
        setMaskPathsReady(false);
        setRegionPalette(finalRegions);
        setRegionCount(finalRegions.length);

        lastSegmentKeyRef.current = `${originPath}|${maskPath}`;
        segmentsReadyRef.current = true;
        setSegmentsReady(true);
        emitWatch('regions_ready', { regionCount: finalRegions.length });
        emitInteractiveIfReady();

        void (async () => {
          if (runId !== segmentRunIdRef.current) {
            return;
          }
          const pathMaskData = downsampleMaskDataForPaths(
            regionMaskDataRef.current!,
            pipeline.maskPathMaxLongSide,
          );
          const outlines = buildAllRegionOutlinePaths(
            finalRegions,
            pathMaskData,
            pathMapRect,
          );
          if (runId !== segmentRunIdRef.current) {
            return;
          }
          setRegionOutlinePaths(outlines);
          setMaskPathsReady(true);
          maskPathsReadyRef.current = true;
          emitMaskPathsReadyIfReady();
        })();

        void (async () => {
          if (runId !== segmentRunIdRef.current) {
            return;
          }
          await paintPromise;
          if (runId !== segmentRunIdRef.current) {
            return;
          }
          baseboardPickMaskRef.current = upscaleBinaryMask(
            segmentResult.baseboardBinary,
            segW,
            segH,
            imgW,
            imgH,
          );
        })();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!isCancelled()) {
          console.error('[SDK-SEGMENT] segmentation failed', e);
          reportError(msg, e);
        }
      }
    },
    [emitWatch, emitInteractiveIfReady, emitMaskPathsReadyIfReady, reportError],
  );

  const loadPaintLayersIfNeeded = useCallback(() => {
    // Use the ref (synced in segmentAndPrepareLayers cleanup) rather than
    // paintResourcesReady state — after switching origin/mask URLs the state
    // may still read true for one frame while layers were already released.
    if (paintResourceLayersRef.current) {
      return Promise.resolve();
    }
    if (paintLayersPromiseRef.current) {
      return paintLayersPromiseRef.current;
    }

    const work = workBufferRef.current;
    if (!work) {
      return Promise.resolve();
    }

    const runId = segmentRunIdRef.current;
    let promise!: Promise<void>;
    promise = (async () => {
      timeLog('▶ start loading paint shader textures');
      try {
        const result = await preparePaintResourcesFromWorkBuffer(
          work.buffer,
          work.cols,
          work.rows,
          layers => {
            if (runId !== segmentRunIdRef.current) {
              releaseFreqLayerImages(layers);
              return;
            }
            setPaintResourceLayers(layers);
            paintResourceLayersRef.current = layers;
            setPaintResourcesReady(true);
            timeLog('▶ paint shader textures ready');
            emitInteractiveIfReady();
          },
        );
        if (runId !== segmentRunIdRef.current) {
          if (result) {
            result.originImage.dispose();
            releasePaintResourceLayers(result.layers);
          }
          return;
        }
        if (!result) {
          return;
        }
        releaseOriginSkImage(originSkImgRef.current);
        originSkImgRef.current = result.originImage;
        setOriginSkImg(result.originImage);
        timeLog('▶ origin Skia work resolution');
        if (!paintResourceLayersRef.current) {
          setPaintResourceLayers(result.layers);
          paintResourceLayersRef.current = result.layers;
          setPaintResourcesReady(true);
        }
        emitInteractiveIfReady();
      } catch (error) {
        if (__DEV__) {
          console.warn('[MaskSegment] failed to prepare paint shader textures', error);
        }
      } finally {
        if (paintLayersPromiseRef.current === promise) {
          paintLayersPromiseRef.current = null;
        }
      }
    })();
    paintLayersPromiseRef.current = promise;
    return promise;
  }, [emitInteractiveIfReady]);

  loadPaintLayersRef.current = loadPaintLayersIfNeeded;

  const clearCacheAndResegment = useCallback(async () => {
    if (resegmentInFlightRef.current || !originImgPath || !maskImgPath) {
      return;
    }

    resegmentInFlightRef.current = true;
    try {
      resetZoom();
      const layers = paintResourceLayersRef.current;
      if (layers) {
        releasePaintResourceLayers(layers);
        paintResourceLayersRef.current = null;
        setPaintResourceLayers(null);
      }

      await clearDerivedImageCache();
      lastSegmentKeyRef.current = '';
      await segmentAndPrepareLayers(originImgPath, maskImgPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reportError(msg, e);
    } finally {
      resegmentInFlightRef.current = false;
    }
  }, [
    originImgPath,
    maskImgPath,
    segmentAndPrepareLayers,
    reportError,
    resetZoom,
  ]);

  useEffect(() => {
    if (!originImgPath || !maskImgPath) {
      return;
    }

    const segmentKey = `${originImgPath}|${maskImgPath}`;
    if (
      lastSegmentKeyRef.current === segmentKey ||
      segmentInFlightKeyRef.current === segmentKey
    ) {
      return;
    }

    resetZoom();
    segmentInFlightKeyRef.current = segmentKey;
    void segmentAndPrepareLayers(originImgPath, maskImgPath).finally(() => {
      if (segmentInFlightKeyRef.current === segmentKey) {
        segmentInFlightKeyRef.current = '';
      }
    });

    return () => {
      segmentRunIdRef.current += 1;
      if (segmentInFlightKeyRef.current === segmentKey) {
        segmentInFlightKeyRef.current = '';
      }
      const layers = paintResourceLayersRef.current;
      if (layers) {
        releasePaintResourceLayers(layers);
        paintResourceLayersRef.current = null;
      }
      paintColorMapSkImgRef.current?.dispose();
      paintColorMapSkImgRef.current = null;
      regionsRef.current = [];
      // Also reset any pending init flash state (the full reset will also run at start of
      // the next segmentAndPrepareLayers, but this keeps things clean if the effect
      // re-triggers segmentation while a flash sequence was in flight).
      initFlashListRef.current = [];
      initFlashActiveRef.current = false;
      initFlashIndexRef.current = 0;
      if (initFlashTimerRef.current) {
        clearTimeout(initFlashTimerRef.current);
        initFlashTimerRef.current = null;
      }
      setInitFlashRegionId(null);
    };
  }, [originImgPath, maskImgPath, resetZoom]);

  const buildPaintedRecords = useCallback((): PaintedRegionRecord[] => {
    const records: PaintedRegionRecord[] = [];
    // Prefer the live ref so getPaintedRegions() / session() used by host for
    // colorParams at save time sees the exact same data as the save() composite.
    const src = paintedRegionsRef.current && paintedRegionsRef.current.size > 0
      ? paintedRegionsRef.current
      : paintedRegions;
    for (const [regionId, color] of src) {
      const region = regionsRef.current.find(reg => reg.id === regionId);
      records.push({
        regionId,
        regionName: region?.name ?? String(regionId),
        color,
        configJson: paintedRegionConfigRef.current.get(regionId),
      });
    }
    return records;
  }, [paintedRegions]);

  const restoreSession = useCallback((session: MaskSegmentSession) => {
    const nextPainted = new Map<number, BgrColor>();
    paintedRegionConfigRef.current = new Map();

    const currentRegions = regionsRef.current || [];
    const nameToRealId = new Map<string, number>();
    for (const r of currentRegions) {
      if (r && r.name) {
        const key = String(r.name).trim().toLowerCase();
        if (key && !nameToRealId.has(key)) {
          nameToRealId.set(key, r.id);
        }
      }
    }

    // Build oldId -> regionName from the incoming seed (for paintHistory remapping).
    const oldIdToName = new Map<number, string>();
    for (const item of session.painted || []) {
      if (item && typeof item.regionId === 'number' && item.regionName) {
        oldIdToName.set(item.regionId, String(item.regionName));
      }
    }

    // Resolve directly by name. Name is unique within a segmentation so there is no
    // need for id-based heuristics — the region name is the authoritative identity.
    for (const item of session.painted || []) {
      if (!item) continue;
      let targetId = item.regionId;

      if (item.regionName) {
        const key = String(item.regionName).trim().toLowerCase();
        const realId = nameToRealId.get(key);
        if (typeof realId === 'number') {
          targetId = realId;
        }
      }

      nextPainted.set(targetId, item.color);
      if (item.configJson) {
        paintedRegionConfigRef.current.set(targetId, item.configJson);
      }
    }

    // Remap paintHistory via names.
    const resolvedHistory: number[] = [];
    for (const oldId of session.paintHistory || []) {
      if (typeof oldId !== 'number') continue;
      const nm = oldIdToName.get(oldId);
      if (nm) {
        const real = nameToRealId.get(String(nm).trim().toLowerCase());
        if (typeof real === 'number') {
          resolvedHistory.push(real);
          continue;
        }
      }
      // Fallback: keep oldId if it happens to be valid in current segmentation.
      if (currentRegions.some((r) => r && r.id === oldId)) {
        resolvedHistory.push(oldId);
      }
    }

    paintedRegionsRef.current = nextPainted;
    setPaintedRegions(nextPainted);
    setPaintHistory(resolvedHistory.length ? resolvedHistory : [...(session.paintHistory || [])]);

    if (session.currentColor) {
      setCustomPaintColor(session.currentColor);
      customPaintConfigJsonRef.current = session.currentColorConfigJson;
      setActiveBrushIndex(null);
    }
 
  }, []);

  useEffect(() => {
    if (!initialSession || !segmentsReady) {
      return;
    }
    if (hasAppliedInitialSessionRef.current) {
      // Already seeded once for this canvas instance / segmentation. Do not re-apply on
      // subsequent initialSession prop changes (host may pass new object refs when its
      // vizSlots or selected brush changes). Re-applying would reset paintedRegions to
      // whatever the (often partial) seed snapshot contains.
      return;
    }
    hasAppliedInitialSessionRef.current = true;
    restoreSession(initialSession);
  }, [initialSession, segmentsReady, restoreSession]);

  useEffect(() => {
    return () => {
      if (initFlashTimerRef.current) {
        clearTimeout(initFlashTimerRef.current);
      }
    };
  }, []);

  const stopInitRegionFlash = useCallback(() => {
    initFlashActiveRef.current = false;
    if (initFlashTimerRef.current) {
      clearTimeout(initFlashTimerRef.current);
      initFlashTimerRef.current = null;
    }
    setInitFlashRegionId(null);
  }, []);

  const startInitRegionFlashLoop = useCallback(() => {
    const ir = getMaskSegmentRuntimeConfig().interaction;
    if (!ir.enableInitRegionFlash) {
      return;
    }
    if (initFlashActiveRef.current) {
      return;
    }
    const allRegions = regionsRef.current;
    if (allRegions.length === 0) {
      return;
    }

    // Filter out painted regions and tiny regions (noise / thin strips
    // that produce negligible overlays). Threshold: 0.2% of total image area.
    const imgSize = imageSizeRef2.current;
    const minFlashArea = imgSize
      ? Math.max(500, imgSize.w * imgSize.h * 0.002)
      : 500;
    initFlashListRef.current = allRegions.filter(
      (r) =>
        !paintedRegionsRef.current.has(r.id) && r.area >= minFlashArea,
    );
    initFlashActiveRef.current = true;
    initFlashIndexRef.current = 0;

    const showNext = () => {
      if (!initFlashActiveRef.current || initFlashListRef.current.length === 0) {
        return;
      }
      const list = initFlashListRef.current;
      const idx = initFlashIndexRef.current;
      if (idx >= list.length) {
        // One full pass of dashed outline flashes (one per *unpainted* region) is enough.
        // Stop automatically; onUserInteraction can stop early.
        stopInitRegionFlash();
        return;
      }
      setInitFlashRegionId(list[idx].id);
      initFlashIndexRef.current += 1;
      initFlashTimerRef.current = setTimeout(
        showNext,
        ir.initRegionFlashMs,
      );
    };

    showNext();
  }, []);

  const onUserInteraction = useCallback(() => {
    stopInitRegionFlash();
  }, [stopInitRegionFlash]);

  // Once any region has been painted, stop the entire discovery flash immediately.
  // No individual pruning — it's all or nothing: either 0 painted → cycle through
  // all regions, or ≥1 painted → stop flashing entirely.
  useEffect(() => {
    if (!initFlashActiveRef.current) return;
    if (paintedRegionsRef.current.size > 0) {
      stopInitRegionFlash();
    }
  }, [paintedRegions, stopInitRegionFlash]);

  useEffect(() => {
    if (segmentsReady && maskPathsReady && containRect && regionCount > 0 && canvasInteractive) {
      if (!initFlashActiveRef.current) {
        startInitRegionFlashLoop();
      }
      return;
    }
    if (!segmentsReady) {
      stopInitRegionFlash();
      setCanvasInteractive(false);
    }
  }, [
    segmentsReady,
    maskPathsReady,
    containRect,
    regionCount,
    canvasInteractive,
    startInitRegionFlashLoop,
    stopInitRegionFlash,
  ]);

  const getActiveBrushColor = useCallback((): BgrColor | null => {
    if (customPaintColor) {
      return customPaintColor;
    }
    if (activeBrushIndex == null) {
      return null;
    }
    return paintPalette[activeBrushIndex] ?? null;
  }, [customPaintColor, activeBrushIndex, paintPalette]);

  const hasActiveBrush = customPaintColor != null || activeBrushIndex != null;

  const applyPaintToRegion = useCallback(
    (targetRegionId: number, color: BgrColor) => {
      let applied = false;
      setPaintedRegions(prev => {
        const existing = prev.get(targetRegionId);
        if (existing && bgrColorEquals(existing, color)) {
          return prev;
        }
        applied = true;
        setPaintHistory(history => {
          const last = history[history.length - 1];
          if (last === targetRegionId) {
            return history;
          }
          return [...history.filter(id => id !== targetRegionId), targetRegionId];
        });
        const next = new Map(prev);
        next.set(targetRegionId, color);
        paintedRegionsRef.current = next;
        return next;
      });

      if (applied) {
        const configJson =
          customPaintConfigJsonRef.current ??
          paintedRegionConfigRef.current.get(targetRegionId);
        if (customPaintConfigJsonRef.current) {
          paintedRegionConfigRef.current.set(
            targetRegionId,
            customPaintConfigJsonRef.current,
          );
        }
        const region = regionsRef.current.find(reg => reg.id === targetRegionId);
        onPaintCallbackRef.current?.({
          kind: 'painted',
          regionId: targetRegionId,
          regionName: region?.name ?? String(targetRegionId),
          color,
          configJson,
        });
      }
    },
    [],
  );

  const findRegionAtPoint = useCallback(
    (x: number, y: number, strict = false): number | null => {
      if (!segmentsReady || !imageSize || regionsRef.current.length === 0) {
        return null;
      }

      const norm = canvasToNormalized(
        x,
        y,
        canvasW,
        canvasH,
        imageSize.w,
        imageSize.h,
      );
      if (!norm) {
        return null;
      }

      const regionPick = regionPickRef.current;
      if (regionPick) {
        const pickHit = lookupRegionFromPickMap(
          norm.x,
          norm.y,
          regionPick,
          strict
            ? 0
            : getMaskSegmentRuntimeConfig().interaction.pickMapSearchRadiusPx,
        );
        if (pickHit != null) {
          return pickHit;
        }
        if (strict) {
          return null;
        }
      }

      const pick = maskPickRef.current;
      const kickId = kickRegionIdRef.current;

      if (!strict) {
        const polygonHit = resolveRegionHit(regionsRef.current, norm.x, norm.y);
        if (polygonHit != null) {
          return polygonHit;
        }
      }

      if (pick && kickId != null) {
        const pickMask = baseboardPickMaskRef.current;
        const kickHit = pickKickRegionFromMask(
          norm.x,
          norm.y,
          pick,
          kickId,
          pickMask,
          strict,
        );
        if (kickHit != null) {
          return kickHit;
        }

        if (!strict) {
          const kickReg = regionsRef.current.find(reg => reg.id === kickId);
          if (kickReg && pickKickNearStrip(norm.x, norm.y, kickReg)) {
            return kickId;
          }
        }
      }

      return null;
    },
    [segmentsReady, imageSize, canvasW, canvasH],
  );

  const onCanvasTap = useCallback(
    (x: number, y: number) => {
      onUserInteraction();
      if (
        !segmentsReady ||
        !imageSize ||
        regionsRef.current.length === 0 ||
        !hasActiveBrush ||
        !paintResourcesReady ||
        disabled
      ) {
        return;
      }

      const regionId = findRegionAtPoint(x, y);
      if (regionId == null) {
        return;
      }

      const brushColor = getActiveBrushColor();
      if (!brushColor) {
        return;
      }

      applyPaintToRegion(regionId, brushColor);
      if (!paintResourcesReady && !paintLayersPromiseRef.current) {
        void loadPaintLayersIfNeeded();
      }
    },
    [
      segmentsReady,
      imageSize,
      hasActiveBrush,
      paintResourcesReady,
      disabled,
      findRegionAtPoint,
      getActiveBrushColor,
      applyPaintToRegion,
      onUserInteraction,
      loadPaintLayersIfNeeded,
    ],
  );

  // ── Canvas-size & state refs for gesture callbacks ─────────────────────
  // Declared after their targets so useRef receives the current value.
  // canvasWRef / canvasHRef are declared earlier (before segmentAndPrepareLayers)
  // so the async body can read the latest layout size. Their sync useEffect is below.
  const hasActiveBrushRef = useRef(hasActiveBrush);
  const disabledRef = useRef(disabled);
  const segmentsReadyRef2 = useRef(segmentsReady);
  const imageSizeRef2 = useRef(imageSize);
  useEffect(() => { canvasWRef.current = canvasW; }, [canvasW]);
  useEffect(() => { canvasHRef.current = canvasH; }, [canvasH]);
  useEffect(() => { hasActiveBrushRef.current = hasActiveBrush; }, [hasActiveBrush]);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { segmentsReadyRef2.current = segmentsReady; }, [segmentsReady]);
  useEffect(() => { imageSizeRef2.current = imageSize; }, [imageSize]);

  // Stable refs for functions called inside gesture closures
  const findRegionAtPointRef = useRef(findRegionAtPoint);
  const onCanvasTapRef = useRef(onCanvasTap);
  const onUserInteractionRef = useRef(onUserInteraction);
  const resetZoomRef = useRef(resetZoom);
  useEffect(() => { findRegionAtPointRef.current = findRegionAtPoint; }, [findRegionAtPoint]);
  useEffect(() => { onCanvasTapRef.current = onCanvasTap; }, [onCanvasTap]);
  useEffect(() => { onUserInteractionRef.current = onUserInteraction; }, [onUserInteraction]);
  useEffect(() => { resetZoomRef.current = resetZoom; }, [resetZoom]);

  const undoSelection = useCallback(() => {
    onUserInteraction();
    setPaintHistory(history => {
      if (history.length === 0) {
        return history;
      }
      const lastId = history[history.length - 1];
      setPaintedRegions(prev => {
        const next = new Map(prev);
        next.delete(lastId);
        paintedRegionsRef.current = next;  // sync for imperative readers
        return next;
      });
      paintedRegionConfigRef.current.delete(lastId);
      return history.slice(0, -1);
    });
  }, [onUserInteraction]);

  const clearAllPaint = useCallback(() => {
    onUserInteraction();
    const cleared = new Map<number, BgrColor>();
    paintedRegionsRef.current = cleared;
    setPaintedRegions(cleared);
    setPaintHistory([]);
    paintedRegionConfigRef.current = new Map();
    lastExportCacheRef.current = null;
    resetZoom();
  }, [onUserInteraction, resetZoom]);

  const captureHighResExportPngBase64 = useCallback(async (): Promise<string | undefined> => {
    try {
      const c = highResExportCanvasRef.current;
      const sz = exportCanvasSize;
      if (!c || !sz) {return undefined;}
      let snap = c.makeImageSnapshot?.();
      if (!snap) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        snap = c.makeImageSnapshot?.();
      }
      if (!snap) {return undefined;}
      const enc = (snap as { encodeToBase64?: () => string }).encodeToBase64;
      if (typeof enc !== 'function') {return undefined;}
      const b64 = enc.call(snap) || '';
      return b64.length > 0 ? b64 : undefined;
    } catch (e) {
      console.warn('[VIZ-SAVE] highResExportCanvas makeImageSnapshot failed:', e);
      return undefined;
    }
  }, [exportCanvasSize]);

  const runExportPipeline = useCallback(async (
    livePainted: Map<number, BgrColor>,
    destDir?: string,
  ): Promise<SavePaintResult> => {
    const work = workBufferRef.current;
    const pick = regionPickRef.current;
    if (!work || !pick) {
      throw new Error('image not ready, cannot save');
    }

    let snapshotPngBase64: string | undefined;
    if (livePainted.size > 0) {
      snapshotPngBase64 = await captureHighResExportPngBase64();
    }
    const layers = paintResourceLayersRef.current;
    const map = paintColorMapSkImgRef.current;
    const originForExport = originSkImgRef.current ?? layers?.lowFreqImage ?? null;
    const shaderTextures = !snapshotPngBase64 && originForExport && layers && map && paintResourcesReady
      ? {
          originImage: originForExport,
          paintColorMap: map,
          lowFreqImage: layers.lowFreqImage,
          highFreqImage: layers.highFreqImage,
        }
      : undefined;

    const result = await compositePaintedImage({
      originBuffer: work.buffer,
      cols: work.cols,
      rows: work.rows,
      pickBuffer: pick.buffer,
      paintedRegions: livePainted,
      destDir,
      ...(snapshotPngBase64 ? { exportPngBase64: snapshotPngBase64 } : {}),
      shaderTextures,
      renderWidth: work.cols,
      renderHeight: work.rows,
    });

    lastExportCacheRef.current = {
      fingerprint: paintedRegionsFingerprint(livePainted),
      result,
    };
    return result;
  }, [captureHighResExportPngBase64, paintResourcesReady]);

  // Debounced background export — pre-warms the save() cache after each paint change.
  useEffect(() => {
    if (!autoExportOnReady) {return;}
    if (!segmentsReady || !paintResourcesReady) {return;}
    if (initialSession && !hasAppliedInitialSessionRef.current) {return;}
    if (paintedRegions.size === 0) {return;}

    if (autoExportDebounceRef.current) {
      clearTimeout(autoExportDebounceRef.current);
    }
    autoExportDebounceRef.current = setTimeout(() => {
      autoExportDebounceRef.current = null;
      if (exportInFlightRef.current) {return;}
      const livePainted = paintedRegionsRef.current;
      if (!livePainted || livePainted.size === 0) {return;}

      exportInFlightRef.current = true;
      void (async () => {
        try {
          const result = await runExportPipeline(livePainted);
          onExportedRef.current?.(result);
        } catch (e) {
          console.log('[VIZ-SAVE] debounced autoExport threw (non-fatal):', e);
        } finally {
          exportInFlightRef.current = false;
        }
      })();
    }, 400);

    return () => {
      if (autoExportDebounceRef.current) {
        clearTimeout(autoExportDebounceRef.current);
        autoExportDebounceRef.current = null;
      }
    };
  }, [
    autoExportOnReady,
    segmentsReady,
    paintResourcesReady,
    initialSession,
    paintedRegions,
    runExportPipeline,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      reset: undoSelection,
      swap: (showOrigin?: boolean) => {
        onUserInteraction();
        if (showOrigin === undefined) {
          setCompareMode(v => !v);
        } else {
          setCompareMode(showOrigin);
        }
      },
      save: async options => {
        const livePainted = paintedRegionsRef.current && paintedRegionsRef.current.size > 0
          ? paintedRegionsRef.current
          : paintedRegions;

        const fp = paintedRegionsFingerprint(livePainted);
        const cached = lastExportCacheRef.current;
        if (cached?.fingerprint === fp && cached.result) {
          return resolveExportResultForDestDir(cached.result, options?.destDir);
        }

        try {
          return await runExportPipeline(livePainted, options?.destDir);
        } catch (e) {
          console.error('[VIZ-SAVE] SDK save() composite threw:', e);
          throw e;
        }
      },
      getLastExport: () => lastExportCacheRef.current?.result ?? null,
      session: () => ({
        version: 1 as const,
        originUrl: originUrlRef.current,
        maskUrl: maskUrlRef.current,
        painted: buildPaintedRecords(),
        paintHistory: [...paintHistory],
        currentColor: customPaintColor ?? undefined,
        currentColorConfigJson: customPaintConfigJsonRef.current,
        savedAt: Date.now(),
      }),
      loadSession: restoreSession,
      setPaintColor: (color, configJson) => {
        setCustomPaintColor(color);
        customPaintConfigJsonRef.current = configJson;
        setActiveBrushIndex(null);
      },
      setMaskConfig: config => {
        setMaskSegmentRuntimeConfig({ maskConfig: config });
        runtimeRef.current = getMaskSegmentRuntimeConfig();
        if (originImgPath && maskImgPath) {
          lastSegmentKeyRef.current = '';
          void segmentAndPrepareLayers(originImgPath, maskImgPath);
        }
      },
      clearAllPaint,
      undoSelection,
      resegment: clearCacheAndResegment,
      getRegions: () => [...regionsRef.current],
      getPaintedRegions: () => buildPaintedRecords(),
    }),
    [
      undoSelection,
      onUserInteraction,
      paintedRegions,
      paintHistory,
      customPaintColor,
      buildPaintedRecords,
      restoreSession,
      clearAllPaint,
      clearCacheAndResegment,
      runExportPipeline,
    ],
  );

  const [regionOutlinePaths, setRegionOutlinePaths] = useState<
    Map<number, SkPath>
  >(new Map());

  useEffect(() => {
    if (!segmentsReady || !containRect || regionPalette.length === 0) {
      if (!segmentsReady) {
        setRegionOutlinePaths(new Map());
        setMaskPathsReady(false);
        maskPathsContainRectRef.current = null;
      }
      return;
    }

    const maskData = regionMaskDataRef.current;
    if (!maskData) {
      setRegionOutlinePaths(new Map());
      setMaskPathsReady(false);
      return;
    }

    if (
      maskPathsContainRectRef.current &&
      rectsEqual(maskPathsContainRectRef.current, containRect)
    ) {
      return;
    }

    const pathStart = __DEV__ ? performance.now() : 0;
    const pathMaskData = downsampleMaskDataForPaths(
      maskData,
      getMaskSegmentRuntimeConfig().pipeline.maskPathMaxLongSide,
    );
    const outlines = buildAllRegionOutlinePaths(
      regionPalette,
      pathMaskData,
      containRect,
    );
    
    maskPathsContainRectRef.current = containRect;
    setRegionOutlinePaths(outlines);
    setMaskPathsReady(true);
    maskPathsReadyRef.current = true;
    emitMaskPathsReadyIfReady();
  }, [segmentsReady, containRect, regionPalette, emitMaskPathsReadyIfReady]);

  const heldOutlinePath = useMemo(() => {
    if (
      heldRegionId == null ||
      heldRegionAnchor == null ||
      !containRect ||
      regionPalette.length === 0
    ) {
      return null;
    }
    const maskData = regionMaskDataRef.current;
    if (!maskData) {
      return null;
    }
    const pathMaskData = downsampleMaskDataForPaths(
      maskData,
      getMaskSegmentRuntimeConfig().pipeline.maskPathMaxLongSide,
    );
    return buildRegionOutlinePathForRegion(
      heldRegionId,
      regionPalette,
      pathMaskData,
      containRect,
      heldRegionAnchor,
    );
  }, [heldRegionId, heldRegionAnchor, containRect, regionPalette]);

  const renderImageLayer = (image: SkImage | null, opacity = 1) => {
    if (!image || !containRect) return null;
    return (
      <SkiaImage
        image={image}
        x={containRect.x}
        y={containRect.y}
        width={containRect.w}
        height={containRect.h}
        opacity={opacity}
      />
    );
  };

  const renderRegionMaskOverlay = (regionId: number, keyPrefix: string) => {
    const path = regionOutlinePaths.get(regionId);
    if (!path || !containRect) return null;
    return (
      <>
        <Path
          key={`${keyPrefix}-fill-${regionId}`}
          path={path}
          color={paintRuntime.regionOverlayFill}
          style="fill"
          opacity={0.05}
        />
        <Path
          key={`${keyPrefix}-stroke-${regionId}`}
          path={path}
          color={paintRuntime.regionOverlayFill}
          style="stroke"
          strokeWidth={3}
          strokeJoin="round"
          antiAlias
        >
          <DashPathEffect intervals={[8, 6]} />
        </Path>
      </>
    );
  };

  // ── Zoom matrix for the Skia Group (pan + scale around center) ──────────
  const zoomMatrix = useMemo(() => {
    if (zoomScale <= 1) {
      return undefined;
    }
    return buildZoomPanMatrix(
      panOffset.x,
      panOffset.y,
      zoomScale,
      canvasW,
      canvasH,
    );
  }, [zoomScale, panOffset, canvasW, canvasH]);

  const renderDraw = () => {
    const displayImg = originSkImg ?? lowFreqSkImg;
    if (!displayImg || !containRect) {
      return null;
    }
    const showOverlay = !compareMode && segmentsReady;
    const shaderReady =
      paintColorMapSkImg &&
      lowFreqSkImg &&
      highFreqSkImg &&
      paintResourcesReady;
    const useShader =
      !compareMode && paintedRegions.size > 0 && shaderReady;
    const shaderOrigin = originSkImg ?? lowFreqSkImg;

    // Background color for areas of the viewport that become visible around the
    // zoomed (centered) photo content. Using a light gray that matches common
    // preview container backgrounds prevents "mosaic-like colored blocks"
    // (shader leakage or edge sampling artifacts) from appearing outside the
    // photo rect when the content is scaled up.
    const previewBg = '#F0F1F3';

    return (
      <>
        {/* Fixed background drawn first (not affected by zoom).
            Any area of the viewport not covered by the scaled photo content
            will show this clean color. */}
        <Rect x={0} y={0} width={canvasW} height={canvasH} color={previewBg} />

        {/* Fixed clip window (in viewport coordinates). The photo content is
            drawn inside this clip after applying the centered zoom transform.
            The clip keeps drawing contained within the logical viewport and
            prevents shader content from leaking outside during zoom. */}
        <Group clip={Skia.XYWHRect(0, 0, canvasW, canvasH)}>
          <Group matrix={zoomMatrix}>
            {useShader && shaderOrigin ? (
              <PaintShaderLayer
                originImage={shaderOrigin}
                paintColorMap={paintColorMapSkImg}
                lowFreqImage={lowFreqSkImg}
                highFreqImage={highFreqSkImg}
                x={containRect.x}
                y={containRect.y}
                width={containRect.w}
                height={containRect.h}
                showOrigin={false}
              />
            ) : (
              renderImageLayer(displayImg)
            )}

            {showOverlay &&
              initFlashRegionId != null &&
              renderRegionMaskOverlay(initFlashRegionId, 'init-overlay')}

            {showOverlay &&
              heldRegionId != null &&
              !paintedRegions.has(heldRegionId) &&
              renderRegionMaskOverlay(heldRegionId, 'hold-overlay')}
          </Group>
        </Group>
      </>
    );
  };

  // Full-bleed (0,0 to work size) composition for the high-res export snapshot canvas.
  // No UI overlays (dashes, held, flash). When painted + shader ready we use the exact
  // same PaintShaderLayer the user sees in the editor, so makeImageSnapshot() gives
  const renderFullResPainted = () => {
    const sz = exportCanvasSize;
    if (!sz) return null;
    const ew = sz.w;
    const eh = sz.h;

    const shaderReady =
      paintColorMapSkImg &&
      lowFreqSkImg &&
      highFreqSkImg &&
      paintResourcesReady;
    const useShader = paintedRegions.size > 0 && shaderReady;
    const shaderOrigin = originSkImg ?? lowFreqSkImg;

    if (useShader && shaderOrigin) {
      return (
        <PaintShaderLayer
          originImage={shaderOrigin}
          paintColorMap={paintColorMapSkImg}
          lowFreqImage={lowFreqSkImg}
          highFreqImage={highFreqSkImg}
          x={0}
          y={0}
          width={ew}
          height={eh}
          showOrigin={false}
        />
      );
    }

    // No paints yet or shader not ready — export the (scaled) origin as-is.
    const displayImg = originSkImg ?? lowFreqSkImg;
    if (displayImg) {
      return (
        <SkiaImage
          image={displayImg}
          x={0}
          y={0}
          width={ew}
          height={eh}
        />
      );
    }
    return null;
  };

  // ── Gesture: tap (single-finger paint / highlight / brush_required) ────
  const tapGesture = useMemo(
    () => {
      const onBeginJS = (x: number, y: number) => {
        // Immediate hold highlight — fires on touch-down regardless of brush state.
        // When a brush is active, this lets the user preview which region they're
        // about to paint before lifting their finger.
        onUserInteractionRef.current?.();
        const coords = screenToCanvasCoords(
          x, y,
          canvasWRef.current, canvasHRef.current,
          zoomScaleRef.current, panOffsetRef.current,
        );
        const regionId = findRegionAtPointRef.current(coords.x, coords.y, true);
        if (regionId == null || !imageSizeRef2.current) {
          setHeldRegionId(null);
          setHeldRegionAnchor(null);
          return;
        }
        if (paintedRegionsRef.current && paintedRegionsRef.current.has(regionId)) {
          setHeldRegionId(null);
          setHeldRegionAnchor(null);
          return;
        }
        const norm = canvasToNormalized(
          coords.x, coords.y,
          canvasWRef.current, canvasHRef.current,
          imageSizeRef2.current.w, imageSizeRef2.current.h,
        );
        setHeldRegionId(regionId);
        setHeldRegionAnchor(norm);
      };

      const onEndJS = (x: number, y: number, success: boolean) => {
        if (!success) return;
        const coords = screenToCanvasCoords(
          x, y,
          canvasWRef.current, canvasHRef.current,
          zoomScaleRef.current, panOffsetRef.current,
        );
        if (hasActiveBrushRef.current) {
          onCanvasTapRef.current(coords.x, coords.y);
        } else {
          // Brush_required
          onUserInteraction();
          if (disabledRef.current || !segmentsReadyRef2.current || !imageSizeRef2.current) return;
          const regionId = findRegionAtPointRef.current(coords.x, coords.y);
          if (regionId == null) return;
          const region = regionsRef.current.find(r => r.id === regionId);
          onPaintCallbackRef.current?.({
            kind: 'brush_required',
            hint: '请先选择笔刷颜色',
            regionId,
            regionName: region?.name ?? String(regionId),
          });
        }
      };

      const onFinalizeJS = (x: number, y: number) => {
        // Cleanup hold highlight (replaces onCanvasPressOut)
        if (hasActiveBrushRef.current) {
          setHeldRegionId(null);
          setHeldRegionAnchor(null);
          return;
        }
        const coords = screenToCanvasCoords(
          x, y,
          canvasWRef.current, canvasHRef.current,
          zoomScaleRef.current, panOffsetRef.current,
        );
        onCanvasTapRef.current(coords.x, coords.y);
        setHeldRegionId(null);
        setHeldRegionAnchor(null);
      };

      return Gesture.Tap()
        .onBegin((e) => {
          'worklet';
          runOnJS(onBeginJS)(e.x, e.y);
        })
        .onEnd((e, success) => {
          'worklet';
          runOnJS(onEndJS)(e.x, e.y, success);
        })
        .onFinalize((e) => {
          'worklet';
          runOnJS(onFinalizeJS)(e.x, e.y);
        });
    },
    [],   // 仅创建一次手势对象；所有回调都通过 Ref 读取最新值，避免初始化期间重复创建导致 Reanimated 节点冲突
  );

  // ── Gesture: pinch-zoom (focal-point scale + two-finger pan; max 5×) ────
  const pinchGesture = useMemo(
    () => {
      const onStartJS = (focalX: number, focalY: number) => {
        pinchBaseScaleRef.current = zoomScaleRef.current;
        pinchBasePanRef.current = { ...panOffsetRef.current };
        pinchBaseFocalRef.current = { x: focalX, y: focalY };
      };
      const onUpdateJS = (scale: number, focalX: number, focalY: number) => {
        const cw = canvasWRef.current;
        const ch = canvasHRef.current;
        if (cw <= 0 || ch <= 0) {
          return;
        }
        const cx = cw / 2;
        const cy = ch / 2;

        const baseScale = pinchBaseScaleRef.current;
        const basePan = pinchBasePanRef.current;
        const baseFocal = pinchBaseFocalRef.current;

        let newScale = Math.max(1, Math.min(baseScale * scale, 5));

        const anchorX = (baseFocal.x - basePan.x - cx) / baseScale + cx;
        const anchorY = (baseFocal.y - basePan.y - cy) / baseScale + cy;

        let newPan = {
          x: focalX - cx - newScale * (anchorX - cx),
          y: focalY - cy - newScale * (anchorY - cy),
        };

        if (newScale <= 1) {
          newScale = 1;
          newPan = { x: 0, y: 0 };
        } else {
          newPan = clampPanOffset(
            newPan,
            newScale,
            cw,
            ch,
            containRectRef.current,
          );
        }

        setZoomScale(newScale);
        setPanOffset(newPan);
        zoomScaleRef.current = newScale;
        panOffsetRef.current = newPan;
      };
      const onEndJS = () => {
        if (zoomScaleRef.current <= 1.01) {
          resetZoomRef.current?.();
        }
      };

      return Gesture.Pinch()
        .onStart((e) => {
          'worklet';
          runOnJS(onStartJS)(e.focalX, e.focalY);
        })
        .onUpdate((e) => {
          'worklet';
          runOnJS(onUpdateJS)(e.scale, e.focalX, e.focalY);
        })
        .onEnd(() => {
          'worklet';
          runOnJS(onEndJS)();
        });
    },
    [],
  );

  // ── Gesture: single-finger pan (active only when zoomed) ───────────────
  const panGesture = useMemo(
    () => {
      const onStartJS = () => {
        panBaseRef.current = { ...panOffsetRef.current };
      };
      const onUpdateJS = (translationX: number, translationY: number) => {
        if (zoomScaleRef.current <= 1) {
          return;
        }
        const newPan = clampPanOffset(
          {
            x: panBaseRef.current.x + translationX,
            y: panBaseRef.current.y + translationY,
          },
          zoomScaleRef.current,
          canvasWRef.current,
          canvasHRef.current,
          containRectRef.current,
        );
        setPanOffset(newPan);
        panOffsetRef.current = newPan;
      };
      const onEndJS = () => {
        if (zoomScaleRef.current <= 1.01) {
          resetZoomRef.current?.();
        }
      };

      return Gesture.Pan()
        .minPointers(1)
        .maxPointers(1)
        .minDistance(10)
        .onStart(() => {
          'worklet';
          runOnJS(onStartJS)();
        })
        .onUpdate((e) => {
          'worklet';
          runOnJS(onUpdateJS)(e.translationX, e.translationY);
        })
        .onEnd(() => {
          'worklet';
          runOnJS(onEndJS)();
        });
    },
    [],
  );

  // ── Composed: pinch + pan simultaneous; tap only when neither claims ───
  const composedGesture = useMemo(
    () =>
      Gesture.Exclusive(
        Gesture.Simultaneous(pinchGesture, panGesture),
        tapGesture,
      ),
    [],
  );


  return (
    <View style={[styles.container, style]}>
      <View
        style={styles.canvasWrap}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          handleCanvasWrapLayout(width, height);
        }}
      >
        {canvasLayoutReady ? (
          <GestureDetector gesture={composedGesture}>
            <View style={{ width: canvasW, height: canvasH }}>
              <Canvas
                style={{ width: canvasW, height: canvasH }}
                pointerEvents="none"
              >
                {renderDraw()}
              </Canvas>
            </View>
          </GestureDetector>
        ) : null}
      </View>

      {highResSnapshotEnabled && exportCanvasSize ? (
        <View
          style={{
            position: 'absolute',
            left: -exportCanvasSize.w - 200,
            top: 0,
            width: exportCanvasSize.w,
            height: exportCanvasSize.h,
            opacity: 0,
            overflow: 'hidden',
          }}
          pointerEvents="none"
        >
          <Canvas
            ref={highResExportCanvasRef}
            style={{ width: exportCanvasSize.w, height: exportCanvasSize.h }}
            pointerEvents="none"
          >
            <Group>
              {renderFullResPainted()}
            </Group>
          </Canvas>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  canvasWrap: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    position: 'relative',
    backgroundColor: '#f5f5f5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
});

export default MaskSegmentCanvas;
