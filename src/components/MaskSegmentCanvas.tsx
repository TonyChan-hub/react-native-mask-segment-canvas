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
  upscaleBinaryMask,
  type RegionMaskData,
  type SegmentRegion,
} from '../utils/maskSegmentation';
import {
  splitWallRegionsByTexture,
  WALL_SUB_LABEL_NONE,
  buildPickMapAfterWallSplit,
  dilatePickBuffer1px,
  patchPickMapForManualWallSplit,
  absorbSmallWallGapsForLassoPolygons,
} from '../utils/wallTextureSplit';
import {
  buildEnergyMap,
  findShortestPath,
  extractCornerPoints,
  normToEnergyPoint,
  energyPointsToNorm,
  isNormPointOnWallMask,
  filterVerticesToWallMask,
  buildWallAllowedMask,
  snapNormPointToWallEdge,
  snapNormPointToWallCornerOrEdge,
  resolveLassoWallDragPoint,
  type EnergyMap,
  type WallMaskSample,
} from '../utils/magneticLasso';
import { refinePolygonToWallEdges } from '../utils/activeContour';
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
  LassoPolygon,
  ManualWallPartition,
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

import {
  type PaintResourceLayers,
  type ContainRect,
  type WorkScaledBgr,
  bgrColorEquals,
  rectsEqual,
  getContainRect,
  canvasToNormalized,
  buildZoomPanMatrix,
  clampPanOffset,
  screenToCanvasCoords,
  pointInPolygon,
  pointInPolygonWithPadding,
  getRegionHitPolygons,
  pointHitsRegion,
  pointStrictlyHitsRegion,
  resolveRegionHit,
  pickKickRegionFromMask,
  pickKickNearStrip,
  lookupRegionFromPickMap,
  releasePaintResourceLayers,
  releaseOriginSkImage,
  prepareWorkScaledBgrBuffer,
  timeLog,
} from '../utils/canvasGeometry';

type LassoVertexHit = {
  kind: 'open' | 'closed';
  polyId?: string;
  vertexIndex: number;
};

function canvasDistToNormVertex(
  canvasX: number,
  canvasY: number,
  nx: number,
  ny: number,
  cw: number,
  ch: number,
  imgW: number,
  imgH: number,
): number {
  const r = getContainRect(cw, ch, imgW, imgH);
  const vx = r.x + nx * r.w;
  const vy = r.y + ny * r.h;
  return Math.hypot(canvasX - vx, canvasY - vy);
}

function isNearOpenLassoFirstVertex(
  canvasX: number,
  canvasY: number,
  cw: number,
  ch: number,
  imgW: number,
  imgH: number,
  openVerts: { x: number; y: number }[] | null,
  thresholdPx: number,
): boolean {
  if (!openVerts || openVerts.length < 3) {
    return false;
  }
  const first = openVerts[0];
  return (
    canvasDistToNormVertex(
      canvasX, canvasY, first.x, first.y, cw, ch, imgW, imgH,
    ) < thresholdPx
  );
}

function findLassoVertexHit(
  canvasX: number,
  canvasY: number,
  cw: number,
  ch: number,
  imgW: number,
  imgH: number,
  thresholdPx: number,
  openVerts: { x: number; y: number }[] | null,
  closedPolys: Map<string, LassoPolygon>,
  options?: { openOnly?: boolean },
): LassoVertexHit | null {
  const r = getContainRect(cw, ch, imgW, imgH);
  let bestDist = Infinity;
  let result: LassoVertexHit | null = null;

  const tryVertex = (
    nx: number,
    ny: number,
    kind: 'open' | 'closed',
    vertexIndex: number,
    polyId?: string,
  ) => {
    const vx = r.x + nx * r.w;
    const vy = r.y + ny * r.h;
    const dist = Math.hypot(canvasX - vx, canvasY - vy);
    if (dist <= thresholdPx && dist < bestDist) {
      bestDist = dist;
      result = { kind, polyId, vertexIndex };
    }
  };

  if (openVerts) {
    for (let i = 0; i < openVerts.length; i++) {
      tryVertex(openVerts[i].x, openVerts[i].y, 'open', i);
    }
  }
  if (!options?.openOnly) {
    for (const [polyId, poly] of closedPolys) {
      for (let i = 0; i < poly.vertices.length; i++) {
        tryVertex(poly.vertices[i].x, poly.vertices[i].y, 'closed', i, polyId);
      }
    }
  }
  return result;
}

function buildWallMaskSampleFromRef(
  maskData: RegionMaskData | null,
): WallMaskSample | null {
  if (!maskData) return null;
  const semanticColors = getMaskSegmentRuntimeConfig().mask.semanticColors;
  const wallSemanticIdx =
    maskData.wallSemanticIdx ??
    semanticColors.findIndex(sc => sc.name === 'wall');
  if (wallSemanticIdx < 0) return null;
  return {
    labels: maskData.labels,
    baseboardBinary: maskData.baseboardBinary,
    cols: maskData.cols,
    rows: maskData.rows,
    wallSemanticIdx,
  };
}

function isNormPointOnAssignedWall(
  normX: number,
  normY: number,
  maskData: RegionMaskData | null,
): boolean {
  if (!maskData?.wallSubLabels || maskData.cols <= 0 || maskData.rows <= 0) {
    return false;
  }
  const { wallSubLabels, cols, rows } = maskData;
  const cx = Math.min(cols - 1, Math.max(0, Math.floor(normX * cols)));
  const cy = Math.min(rows - 1, Math.max(0, Math.floor(normY * rows)));
  return wallSubLabels[cy * cols + cx] !== WALL_SUB_LABEL_NONE;
}

function isNormPointInCommittedLassoArea(
  normX: number,
  normY: number,
  committedParts: ManualWallPartition[],
  sessionClosedPolys: Map<string, LassoPolygon>,
  excludePolyId?: string,
): boolean {
  for (const part of committedParts) {
    if (
      part.vertices.length >= 3 &&
      pointInPolygon(normX, normY, part.vertices)
    ) {
      return true;
    }
  }
  for (const [polyId, poly] of sessionClosedPolys) {
    if (polyId === excludePolyId || !poly.isClosed || poly.vertices.length < 3) {
      continue;
    }
    if (pointInPolygon(normX, normY, poly.vertices)) {
      return true;
    }
  }
  return false;
}

function canPlaceLassoPointAt(
  normX: number,
  normY: number,
  maskData: RegionMaskData | null,
  wallMask: WallMaskSample | null,
  committedParts: ManualWallPartition[],
  sessionPolys: Map<string, LassoPolygon>,
): boolean {
  if (!wallMask || !isNormPointOnWallMask(normX, normY, wallMask)) {
    return false;
  }
  if (isNormPointOnAssignedWall(normX, normY, maskData)) {
    return false;
  }
  return !isNormPointInCommittedLassoArea(
    normX, normY, committedParts, sessionPolys,
  );
}
function lassoPolygonUsesCommittedArea(
  vertices: { x: number; y: number }[],
  maskData: RegionMaskData | null,
  committedParts: ManualWallPartition[],
  sessionPolys: Map<string, LassoPolygon>,
  excludePolyId?: string,
): boolean {
  for (const v of vertices) {
    if (isNormPointOnAssignedWall(v.x, v.y, maskData)) {
      return true;
    }
    if (
      isNormPointInCommittedLassoArea(
        v.x, v.y, committedParts, sessionPolys, excludePolyId,
      )
    ) {
      return true;
    }
  }
  if (vertices.length >= 3) {
    const cx = vertices.reduce((s, v) => s + v.x, 0) / vertices.length;
    const cy = vertices.reduce((s, v) => s + v.y, 0) / vertices.length;
    if (isNormPointOnAssignedWall(cx, cy, maskData)) {
      return true;
    }
    if (
      isNormPointInCommittedLassoArea(
        cx, cy, committedParts, sessionPolys, excludePolyId,
      )
    ) {
      return true;
    }
  }
  return false;
}

/* ==========================================================================
 * component
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
  const paintHistoryRef = useRef<number[]>([]);

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
  useEffect(() => {
    paintHistoryRef.current = paintHistory;
  }, [paintHistory]);

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
  // PNG bytes. This is the preferred "snapshot" path and avoids CPU recolor entirely
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

  // ── Manual Lasso State ────────────────────────────────────────────────
  const [isLassoActive, setIsLassoActive] = useState(false);
  const isLassoActiveRef = useRef(false);
  const [lassoPolygons, setLassoPolygons] = useState<Map<string, LassoPolygon>>(new Map());
  const lassoPolygonsRef = useRef<Map<string, LassoPolygon>>(new Map());
  const [currentLassoVertices, setCurrentLassoVertices] = useState<{ x: number; y: number }[] | null>(null);
  const currentLassoVerticesRef = useRef<{ x: number; y: number }[] | null>(null);
  const [manualWallRegions, setManualWallRegions] = useState<ManualWallPartition[]>([]);
  const manualWallRegionsRef = useRef<ManualWallPartition[]>([]);
  const lassoIdCounterRef = useRef(0);
  const LASSO_COLOR = '#FF6B35';
  const MAGNETIC_LASSO_COLOR = '#00C853';
  const LASSO_CLOSE_THRESHOLD_PX = 32;
  const LASSO_VERTEX_HIT_PX = 20;
  const LASSO_DRAG_ACTIVATE_PX = 10;
  const LASSO_MIN_VERTEX_SPACING_PX = 14;
  const LASSO_EDGE_SNAP_SEG_PX = 12;
  const LASSO_TAP_SNAP_SEG_PX = 20;
  const LASSO_TAP_CANCEL_PX = 8;

  const lassoDragRef = useRef<LassoVertexHit | null>(null);
  const lassoVertexCandidateRef = useRef<LassoVertexHit | null>(null);
  const lassoDragMovedRef = useRef(false);
  const lassoPendingTapRef = useRef<{ x: number; y: number } | null>(null);
  const [lassoDragVertex, setLassoDragVertex] = useState<LassoVertexHit | null>(
    null,
  );

  const [energyMap, setEnergyMap] = useState<EnergyMap | null>(null);
  const energyMapRef = useRef<EnergyMap | null>(null);

  useEffect(() => { zoomScaleRef.current = zoomScale; }, [zoomScale]);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);
  useEffect(() => { isLassoActiveRef.current = isLassoActive; }, [isLassoActive]);
  useEffect(() => { lassoPolygonsRef.current = lassoPolygons; }, [lassoPolygons]);
  useEffect(() => { currentLassoVerticesRef.current = currentLassoVertices; }, [currentLassoVertices]);
  useEffect(() => { manualWallRegionsRef.current = manualWallRegions; }, [manualWallRegions]);
  useEffect(() => { energyMapRef.current = energyMap; }, [energyMap]);

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
  const lastOutlineRegionKeyRef = useRef('');
  const [regionPickGeneration, setRegionPickGeneration] = useState(0);

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
  }, [
    paintedRegions,
    paintResourcesReady,
    segmentsReady,
    regionPickGeneration,
    getMaskRuntimeRevision(),
  ]);

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
      // Reset lasso state on new segmentation
      setIsLassoActive(false);
      isLassoActiveRef.current = false;
      setLassoPolygons(new Map());
      lassoPolygonsRef.current = new Map();
      setCurrentLassoVertices(null);
      currentLassoVerticesRef.current = null;
      setManualWallRegions([]);
      manualWallRegionsRef.current = [];
      setEnergyMap(null);
      energyMapRef.current = null;
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
        const runtimeMaskCfg = getMaskSegmentRuntimeConfig().mask;
        if (runtimeMaskCfg.splitWalls && !runtimeMaskCfg.manualSplitWalls) {
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
        const segSemanticColors =
          getMaskSegmentRuntimeConfig().mask.semanticColors;
        const segIndexToName = segSemanticColors.map(sc => sc.name);
        const segWallSemanticIdx = segIndexToName.indexOf('wall');
        regionMaskDataRef.current = {
          labels: segmentResult.labels,
          baseboardBinary: segmentResult.baseboardBinary,
          cols: segmentResult.segCols,
          rows: segmentResult.segRows,
          wallSubLabels: segmentResult.wallSubLabels,
          indexToName: segIndexToName,
          wallSemanticIdx: segWallSemanticIdx >= 0 ? segWallSemanticIdx : undefined,
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

      const isValidRegionId = (id: number | null): id is number =>
        id != null && regionsRef.current.some(r => r.id === id);

      const regionPick = regionPickRef.current;
      const pickRadius = strict
        ? 0
        : getMaskSegmentRuntimeConfig().interaction.pickMapSearchRadiusPx;

      if (regionPick) {
        const centerHit = lookupRegionFromPickMap(norm.x, norm.y, regionPick, 0);
        if (isValidRegionId(centerHit)) {
          return centerHit;
        }
        if (strict) {
          return null;
        }
      }

      if (!strict) {
        const polygonHit = resolveRegionHit(regionsRef.current, norm.x, norm.y);
        if (polygonHit != null) {
          return polygonHit;
        }
      }

      if (regionPick && !strict && pickRadius > 0) {
        const radiusHit = lookupRegionFromPickMap(
          norm.x,
          norm.y,
          regionPick,
          pickRadius,
        );
        if (isValidRegionId(radiusHit)) {
          return radiusHit;
        }
      }

      const pick = maskPickRef.current;
      const kickId = kickRegionIdRef.current;

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
      startLasso: () => {
        setLassoPolygons(new Map());
        lassoPolygonsRef.current = new Map();
        setCurrentLassoVertices(null);
        currentLassoVerticesRef.current = null;
        // Keep manualWallRegions / existing wall-N partitions — each session adds more.
        setIsLassoActive(true);
        isLassoActiveRef.current = true;

        // Precompute energy map for magnetic lasso
        const isMagnetic = getMaskSegmentRuntimeConfig().mask.magneticLasso;
        if (isMagnetic && getMaskSegmentRuntimeConfig().mask.manualSplitWalls) {
          const work = workBufferRef.current;
          if (work && work.cols > 0 && work.rows > 0) {
            const maskData = regionMaskDataRef.current;
            const semanticColors = getMaskSegmentRuntimeConfig().mask.semanticColors;
            const wallSemanticIdx =
              maskData?.wallSemanticIdx ??
              semanticColors.findIndex(sc => sc.name === 'wall');
            let allowedMask: Uint8Array | null = null;
            if (
              maskData &&
              wallSemanticIdx >= 0 &&
              maskData.cols === work.cols &&
              maskData.rows === work.rows
            ) {
              allowedMask = buildWallAllowedMask(
                maskData.labels,
                maskData.baseboardBinary,
                wallSemanticIdx,
              );
            }
            const map = buildEnergyMap(
              work.buffer,
              work.cols,
              work.rows,
              256,
              allowedMask,
            );
            setEnergyMap(map);
            energyMapRef.current = map;
          }
        }
      },
      cancelLasso: () => {
        setIsLassoActive(false);
        isLassoActiveRef.current = false;
        setCurrentLassoVertices(null);
        currentLassoVerticesRef.current = null;
        setLassoPolygons(new Map());
        lassoPolygonsRef.current = new Map();
        setEnergyMap(null);
        energyMapRef.current = null;
        lassoDragRef.current = null;
        lassoPendingTapRef.current = null;
        lassoVertexCandidateRef.current = null;
        lassoDragMovedRef.current = false;
        setLassoDragVertex(null);
      },
      endLasso: () => {
        const maskDataEarly = regionMaskDataRef.current;
        const semanticColorsEarly = getMaskSegmentRuntimeConfig().mask.semanticColors;
        const wallIdxEarly =
          maskDataEarly?.wallSemanticIdx ??
          semanticColorsEarly.findIndex(sc => sc.name === 'wall');
        const wallMaskEarly: WallMaskSample | null =
          maskDataEarly && wallIdxEarly >= 0
            ? {
                labels: maskDataEarly.labels,
                baseboardBinary: maskDataEarly.baseboardBinary,
                cols: maskDataEarly.cols,
                rows: maskDataEarly.rows,
                wallSemanticIdx: wallIdxEarly,
              }
            : null;
        const hasEnoughWallVerts = (verts: { x: number; y: number }[]) => {
          if (verts.length < 3) return false;
          if (!wallMaskEarly) return true;
          return filterVerticesToWallMask(verts, wallMaskEarly).length >= 3;
        };

        // 1. Finalize open polygon if possible (keep raw vertices for rasterization)
        const cur = currentLassoVerticesRef.current;
        if (cur && hasEnoughWallVerts(cur)) {
          const id = `lasso_${++lassoIdCounterRef.current}`;
          const polygon: LassoPolygon = {
            id,
            vertices: [...cur],
            isClosed: true,
          };
          const nextPolys = new Map(lassoPolygonsRef.current);
          nextPolys.set(id, polygon);
          lassoPolygonsRef.current = nextPolys;
          setLassoPolygons(nextPolys);
          setCurrentLassoVertices(null);
          currentLassoVerticesRef.current = null;
        }

        // 2. Collect closed polygons
        const polys = new Map(
          [...lassoPolygonsRef.current.entries()].filter(([, poly]) =>
            hasEnoughWallVerts(poly.vertices),
          ),
        );
        if (polys.size === 0) {
          return [...manualWallRegionsRef.current];
        }

        // 4. Get necessary data
        const regions = regionsRef.current;
        const wallTemplate =
          regions.find(r => r.name === 'wall') ??
          regions.find(r => /^wall-\d+$/.test(r.name));
        if (!wallTemplate) {
          return [...manualWallRegionsRef.current];
        }

        const wallHex = wallTemplate.hex;
        const wallColor = { ...wallTemplate.color };

        const maskData = regionMaskDataRef.current;
        if (!maskData) {
          return [...manualWallRegionsRef.current];
        }

        const { labels, baseboardBinary, cols: segW, rows: segH } = maskData;
        const segPixelCount = segW * segH;

        // 3. Active contour refinement: expand polygon vertices outward toward wall boundary
        const activeContourRefine = getMaskSegmentRuntimeConfig().mask.activeContourRefine;
        if (activeContourRefine && wallMaskEarly) {
          for (const [, poly] of polys) {
            poly.vertices = refinePolygonToWallEdges(poly.vertices, wallMaskEarly);
          }
        }

        // Find wall semantic index in the label buffer (prefer value captured at segmentation).
        const semanticColors = getMaskSegmentRuntimeConfig().mask.semanticColors;
        const polyEntries = [...polys.entries()];
        const polyVertsList = polyEntries.map(([, poly]) => poly.vertices);

        const inferDominantLabelInPolys = (): number => {
          const labelCounts = new Map<number, number>();
          for (let y = 0; y < segH; y++) {
            for (let x = 0; x < segW; x++) {
              const normX = (x + 0.5) / segW;
              const normY = (y + 0.5) / segH;
              let inside = false;
              for (const verts of polyVertsList) {
                if (pointInPolygon(normX, normY, verts)) {
                  inside = true;
                  break;
                }
              }
              if (!inside) continue;
              const label = labels[y * segW + x];
              if (label === 255) continue;
              labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
            }
          }
          let bestLabel = -1;
          let bestCount = 0;
          for (const [label, count] of labelCounts) {
            if (count > bestCount) {
              bestLabel = label;
              bestCount = count;
            }
          }
          return bestLabel;
        };

        const indexToName =
          maskData.indexToName ?? semanticColors.map(sc => sc.name);

        let wallSemanticIdx =
          maskData.wallSemanticIdx ??
          semanticColors.findIndex(sc => sc.name === 'wall');
        if (wallSemanticIdx < 0) {
          const inferred = inferDominantLabelInPolys();
          if (inferred >= 0 && indexToName[inferred] === 'wall') {
            wallSemanticIdx = inferred;
          }
        }
        if (wallSemanticIdx < 0) {
          return [...manualWallRegionsRef.current];
        }

        const rasterizeNewWallAreas = (
          wallIdx: number,
          assignedLabels: Uint8Array,
        ) => {
          areas.fill(0);
          for (const b of bboxes) {
            b.x = segW;
            b.y = segH;
            b.w = 0;
            b.h = 0;
          }

          for (let y = 0; y < segH; y++) {
            for (let x = 0; x < segW; x++) {
              const i = y * segW + x;
              if (labels[i] !== wallIdx) continue;
              if (baseboardBinary[i]) continue;
              // Skip wall pixels already assigned to a previous lasso session.
              if (assignedLabels[i] !== WALL_SUB_LABEL_NONE) continue;

              const normX = (x + 0.5) / segW;
              const normY = (y + 0.5) / segH;

              for (let pi = 0; pi < polyEntries.length; pi++) {
                const poly = polyEntries[pi][1];
                if (pointInPolygon(normX, normY, poly.vertices)) {
                  newPolyLabels[i] = pi;
                  areas[pi]++;
                  const b = bboxes[pi];
                  if (x < b.x) b.x = x;
                  if (y < b.y) b.y = y;
                  const right = x + 1;
                  const bottom = y + 1;
                  if (right > b.x + b.w) b.w = right - b.x;
                  if (bottom > b.y + b.h) b.h = bottom - b.y;
                  break;
                }
              }
            }
          }
        };

        // 5. Preserve existing wall sub-labels; rasterize only NEW unassigned wall pixels.
        const remappedWallSubLabels = new Uint8Array(segPixelCount);
        if (
          maskData.wallSubLabels &&
          maskData.wallSubLabels.length === segPixelCount
        ) {
          remappedWallSubLabels.set(maskData.wallSubLabels);
        } else {
          remappedWallSubLabels.fill(WALL_SUB_LABEL_NONE);
        }

        let maxExistingSub = -1;
        for (let i = 0; i < segPixelCount; i++) {
          const sub = remappedWallSubLabels[i];
          if (sub !== WALL_SUB_LABEL_NONE) {
            maxExistingSub = Math.max(maxExistingSub, sub);
          }
        }

        const existingWallRegions = regions.filter(r =>
          /^wall-\d+$/.test(r.name),
        );
        let maxWallNum = 0;
        for (const reg of existingWallRegions) {
          const m = /^wall-(\d+)$/.exec(reg.name);
          if (m) {
            maxWallNum = Math.max(maxWallNum, Number(m[1]));
          }
        }

        const newPolyLabels = new Uint8Array(segPixelCount);
        newPolyLabels.fill(WALL_SUB_LABEL_NONE);
        const areas: number[] = new Array(polyEntries.length).fill(0);
        const bboxes = polyEntries.map(() => ({
          x: segW, y: segH, w: 0, h: 0,
        }));

        rasterizeNewWallAreas(wallSemanticIdx, remappedWallSubLabels);

        // Retry with inferred label if name-based index matched no new wall pixels
        if (areas.every(a => a === 0)) {
          const inferred = inferDominantLabelInPolys();
          if (
            inferred >= 0 &&
            indexToName[inferred] === 'wall' &&
            inferred !== wallSemanticIdx
          ) {
            wallSemanticIdx = inferred;
            newPolyLabels.fill(WALL_SUB_LABEL_NONE);
            rasterizeNewWallAreas(wallSemanticIdx, remappedWallSubLabels);
          }
        }

        const gapAbsorbDilatePx =
          getMaskSegmentRuntimeConfig().mask.manualSplitWallsGapAbsorbDilatePx ??
          5;
        if (gapAbsorbDilatePx > 0 && polyEntries.length > 0) {
          absorbSmallWallGapsForLassoPolygons(
            newPolyLabels,
            polyEntries.length,
            areas,
            bboxes,
            labels,
            baseboardBinary,
            wallSemanticIdx,
            remappedWallSubLabels,
            segW,
            segH,
            gapAbsorbDilatePx,
          );
        }

        // 6. Keep new polygons that captured unassigned wall pixels
        const maxCount =
          getMaskSegmentRuntimeConfig().mask.manualSplitWallsMaxCount ?? 8;
        const slotsForNew = Math.max(0, maxCount - existingWallRegions.length);
        const keptPolyIndices = areas
          .map((area, idx) => ({ area, idx }))
          .filter(entry => entry.area > 0)
          .sort((a, b) => b.area - a.area)
          .slice(0, slotsForNew)
          .map(entry => entry.idx);

        if (keptPolyIndices.length === 0) {
          return [...manualWallRegionsRef.current];
        }

        for (let i = 0; i < segPixelCount; i++) {
          const polyIdx = newPolyLabels[i];
          if (polyIdx === WALL_SUB_LABEL_NONE) continue;
          const rank = keptPolyIndices.indexOf(polyIdx);
          if (rank >= 0) {
            remappedWallSubLabels[i] = maxExistingSub + 1 + rank;
          }
        }

        const nonWallRegions = regions.filter(
          r => r.name !== 'wall' && !/^wall-\d+$/.test(r.name),
        );
        const maxRegionId = regions.reduce(
          (max, r) => Math.max(max, r.id),
          -1,
        );
        const newWallSubRegions: SegmentRegion[] = keptPolyIndices.map(
          (origIdx, rank) => {
            const [, poly] = polyEntries[origIdx];
            const b = bboxes[origIdx];
            return {
              id: maxRegionId + 1 + rank,
              name: `wall-${maxWallNum + rank + 1}`,
              hex: wallHex,
              color: wallColor,
              polygons: [poly.vertices.map(v => ({ x: v.x, y: v.y }))],
              outlinePolygons: [poly.vertices.map(v => ({ x: v.x, y: v.y }))],
              bbox: {
                x: b.x / segW,
                y: b.y / segH,
                w: b.w / segW,
                h: b.h / segH,
              },
              area: areas[origIdx],
            };
          },
        );

        // Keep non-wall + existing wall-N; append new wall-(N+1)…
        const mergedRegions = [
          ...nonWallRegions,
          ...existingWallRegions,
          ...newWallSubRegions,
        ];

        // 8. Patch wall pixels in the existing pick map (non-wall codes stay untouched).
        const nameToId = new Map(mergedRegions.map(reg => [reg.name, reg.id]));
        const existingPick = regionPickRef.current;
        let newPickBuffer: Uint8Array;
        if (
          existingPick &&
          existingPick.cols === segW &&
          existingPick.rows === segH &&
          existingPick.buffer.length === segPixelCount
        ) {
          newPickBuffer = patchPickMapForManualWallSplit(
            existingPick.buffer,
            labels,
            baseboardBinary,
            wallSemanticIdx,
            remappedWallSubLabels,
            nameToId,
            segW,
            segH,
          );
        } else {
          const pickRaw = buildPickMapAfterWallSplit(
            labels,
            baseboardBinary,
            wallSemanticIdx,
            remappedWallSubLabels,
            indexToName,
            nameToId,
            segW,
            segH,
          );
          newPickBuffer = dilatePickBuffer1px(pickRaw, segW, segH);
        }

        // Drop only the monolithic "wall" paint; keep existing wall-N paints.
        const keptPainted = new Map<number, BgrColor>();
        for (const [regionId, color] of paintedRegionsRef.current) {
          const reg = regions.find(r => r.id === regionId);
          if (!reg) continue;
          if (reg.name === 'wall') {
            paintedRegionConfigRef.current.delete(regionId);
            continue;
          }
          keptPainted.set(regionId, color);
        }
        paintedRegionsRef.current = keptPainted;

        const keptHistory = paintHistoryRef.current.filter(regionId => {
          const reg = regions.find(r => r.id === regionId);
          return reg != null && reg.name !== 'wall';
        });

        // 9. Update refs and state
        regionsRef.current = mergedRegions;
        regionPickRef.current = { buffer: newPickBuffer, cols: segW, rows: segH };
        kickRegionIdRef.current =
          mergedRegions.find(reg => reg.thinStrip)?.id ?? null;
        regionMaskDataRef.current = {
          labels: maskData.labels,
          baseboardBinary: maskData.baseboardBinary,
          cols: segW,
          rows: segH,
          wallSubLabels: remappedWallSubLabels,
          indexToName,
          wallSemanticIdx,
        };

        // Keep paint preview in sync with the rebuilt pick buffer (same pick used by shader).
        if (keptPainted.size > 0) {
          paintColorMapSkImgRef.current?.dispose();
          paintColorMapSkImgRef.current = createPaintColorMapForPaint(
            newPickBuffer,
            segW,
            segH,
            keptPainted,
          );
        }

        // 10. Build ManualWallPartition results (append to previous sessions)
        const wallRegionNameToRegion = new Map(
          mergedRegions
            .filter(r => /^wall-\d+$/.test(r.name))
            .map(r => [r.name, r] as const),
        );
        const newManualParts: ManualWallPartition[] = keptPolyIndices
          .map((origIdx, rank) => {
            const [polyId, poly] = polyEntries[origIdx];
            const regionName = `wall-${maxWallNum + rank + 1}`;
            const segRegion = wallRegionNameToRegion.get(regionName);
            if (!segRegion) return null;
            return {
              id: polyId,
              regionId: segRegion.id,
              regionName: segRegion.name,
              vertices: poly.vertices,
              bbox: segRegion.bbox,
              area: segRegion.area,
            };
          })
          .filter((p): p is ManualWallPartition => p != null);

        const allManualParts = [
          ...manualWallRegionsRef.current,
          ...newManualParts,
        ];

        setManualWallRegions(allManualParts);
        manualWallRegionsRef.current = allManualParts;
        setRegionPalette(mergedRegions);
        setRegionCount(mergedRegions.length);
        setPaintedRegions(keptPainted);
        setPaintHistory(keptHistory);
        setRegionPickGeneration(g => g + 1);
        // Force outline path rebuild (region IDs/names changed even if canvas layout did not).
        maskPathsContainRectRef.current = null;
        lastOutlineRegionKeyRef.current = '';

        // Exit lasso mode only after a successful commit
        setIsLassoActive(false);
        isLassoActiveRef.current = false;
        setCurrentLassoVertices(null);
        currentLassoVerticesRef.current = null;
        setEnergyMap(null);
        energyMapRef.current = null;
        setLassoPolygons(new Map());
        lassoPolygonsRef.current = new Map();

        return allManualParts;
      },
      getManualRegions: () => [...manualWallRegionsRef.current],
      deleteLasso: (id: string) => {
        if (lassoPolygonsRef.current.has(id)) {
          setLassoPolygons(prev => {
            const next = new Map(prev);
            next.delete(id);
            lassoPolygonsRef.current = next;
            return next;
          });
          return;
        }

        const part = manualWallRegionsRef.current.find(p => p.id === id);
        if (!part) {
          return;
        }

        const regions = regionsRef.current;
        const maskData = regionMaskDataRef.current;
        const pick = regionPickRef.current;
        if (!maskData || !pick) {
          return;
        }

        const subMatch = /^wall-(\d+)$/.exec(part.regionName);
        if (!subMatch) {
          return;
        }
        const subToDelete = Number(subMatch[1]) - 1;

        const { labels, baseboardBinary, cols: segW, rows: segH } = maskData;
        const segPixelCount = segW * segH;
        const semanticColors = getMaskSegmentRuntimeConfig().mask.semanticColors;
        const indexToName =
          maskData.indexToName ?? semanticColors.map(sc => sc.name);
        let wallSemanticIdx =
          maskData.wallSemanticIdx ??
          semanticColors.findIndex(sc => sc.name === 'wall');
        if (wallSemanticIdx < 0) {
          return;
        }

        const wallSubLabels = new Uint8Array(
          maskData.wallSubLabels?.length === segPixelCount
            ? maskData.wallSubLabels
            : new Uint8Array(segPixelCount).fill(WALL_SUB_LABEL_NONE),
        );
        for (let i = 0; i < segPixelCount; i++) {
          if (wallSubLabels[i] === subToDelete) {
            wallSubLabels[i] = WALL_SUB_LABEL_NONE;
          }
        }

        const mergedRegions = regions.filter(r => r.id !== part.regionId);
        const nameToId = new Map(mergedRegions.map(reg => [reg.name, reg.id]));

        const newPickBuffer = patchPickMapForManualWallSplit(
          pick.buffer,
          labels,
          baseboardBinary,
          wallSemanticIdx,
          wallSubLabels,
          nameToId,
          segW,
          segH,
        );

        const keptPainted = new Map(paintedRegionsRef.current);
        keptPainted.delete(part.regionId);
        paintedRegionConfigRef.current.delete(part.regionId);
        paintedRegionsRef.current = keptPainted;

        const keptHistory = paintHistoryRef.current.filter(
          regionId => regionId !== part.regionId,
        );
        paintHistoryRef.current = keptHistory;

        regionsRef.current = mergedRegions;
        regionPickRef.current = { buffer: newPickBuffer, cols: segW, rows: segH };
        regionMaskDataRef.current = {
          labels: maskData.labels,
          baseboardBinary: maskData.baseboardBinary,
          cols: segW,
          rows: segH,
          wallSubLabels,
          indexToName,
          wallSemanticIdx,
        };

        const allManualParts = manualWallRegionsRef.current.filter(
          p => p.id !== id,
        );
        manualWallRegionsRef.current = allManualParts;

        setManualWallRegions(allManualParts);
        setRegionPalette(mergedRegions);
        setRegionCount(mergedRegions.length);
        setPaintedRegions(keptPainted);
        setPaintHistory(keptHistory);
        setRegionPickGeneration(g => g + 1);
        maskPathsContainRectRef.current = null;
        lastOutlineRegionKeyRef.current = '';
      },
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

    const regionLayoutKey = regionPalette
      .map(r => `${r.id}:${r.name}`)
      .join('|');
    if (
      lastOutlineRegionKeyRef.current === regionLayoutKey &&
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
    lastOutlineRegionKeyRef.current = regionLayoutKey;
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

            {/* Lasso polygon rendering */}
            {isLassoActive && imageSize && containRect && (() => {
              const elements: React.ReactNode[] = [];
              const imgW = imageSize.w;
              const imgH = imageSize.h;
              const r = containRect;

              // Helper: normalized → canvas
              const n2c = (nx: number, ny: number) => ({
                x: r.x + nx * r.w,
                y: r.y + ny * r.h,
              });

              const lassoRenderColor = energyMapRef.current ? MAGNETIC_LASSO_COLOR : LASSO_COLOR;

              const maskDataForRender = regionMaskDataRef.current;
              const wallIdxForRender =
                maskDataForRender?.wallSemanticIdx ??
                getMaskSegmentRuntimeConfig()
                  .mask.semanticColors.findIndex(sc => sc.name === 'wall');
              const wallMaskForRender: WallMaskSample | null =
                maskDataForRender && wallIdxForRender >= 0
                  ? {
                      labels: maskDataForRender.labels,
                      baseboardBinary: maskDataForRender.baseboardBinary,
                      cols: maskDataForRender.cols,
                      rows: maskDataForRender.rows,
                      wallSemanticIdx: wallIdxForRender,
                    }
                  : null;
              const visibleWallVerts = (verts: { x: number; y: number }[]) =>
                wallMaskForRender
                  ? filterVerticesToWallMask(verts, wallMaskForRender)
                  : verts;

              // Render finished (closed) lasso polygons
              for (const [, poly] of lassoPolygons) {
                const polyVerts = visibleWallVerts(poly.vertices);
                if (!poly.isClosed || polyVerts.length < 3) continue;
                const path = Skia.Path.Make();
                const v0 = n2c(polyVerts[0].x, polyVerts[0].y);
                path.moveTo(v0.x, v0.y);
                for (let i = 1; i < polyVerts.length; i++) {
                  const vt = n2c(polyVerts[i].x, polyVerts[i].y);
                  path.lineTo(vt.x, vt.y);
                }
                path.close();

                elements.push(
                  <Path
                    key={`lasso-poly-${poly.id}`}
                    path={path}
                    color={lassoRenderColor}
                    style="stroke"
                    strokeWidth={2.5}
                    strokeJoin="round"
                    antiAlias
                  >
                    <DashPathEffect intervals={[10, 6]} />
                  </Path>,
                );

                // Vertex dots
                for (let i = 0; i < polyVerts.length; i++) {
                  const vc = n2c(polyVerts[i].x, polyVerts[i].y);
                  const isDragging =
                    lassoDragVertex?.kind === 'closed' &&
                    lassoDragVertex.polyId === poly.id &&
                    lassoDragVertex.vertexIndex === i;
                  const dotR = isDragging ? 7 : 4;
                  const dot = Skia.Path.Make();
                  const dotRect = Skia.XYWHRect(
                    vc.x - dotR,
                    vc.y - dotR,
                    dotR * 2,
                    dotR * 2,
                  );
                  dot.addOval(dotRect);
                  elements.push(
                    <Path
                      key={`lasso-dot-${poly.id}-${i}`}
                      path={dot}
                      color={isDragging ? '#FFFFFF' : lassoRenderColor}
                      style="fill"
                      antiAlias
                    />,
                  );
                  if (isDragging) {
                    const ring = Skia.Path.Make();
                    ring.addOval(dotRect);
                    elements.push(
                      <Path
                        key={`lasso-dot-ring-${poly.id}-${i}`}
                        path={ring}
                        color={lassoRenderColor}
                        style="stroke"
                        strokeWidth={2}
                        antiAlias
                      />,
                    );
                  }
                }
              }

              // Render current (open) polygon
              if (currentLassoVertices && currentLassoVertices.length > 0) {
                const openVerts = visibleWallVerts(currentLassoVertices);
                if (openVerts.length > 0) {
                  const openPath = Skia.Path.Make();
                  const v0 = n2c(openVerts[0].x, openVerts[0].y);
                  openPath.moveTo(v0.x, v0.y);
                  for (let i = 1; i < openVerts.length; i++) {
                    const vt = n2c(openVerts[i].x, openVerts[i].y);
                    openPath.lineTo(vt.x, vt.y);
                  }
                  if (openVerts.length >= 3) {
                    openPath.lineTo(v0.x, v0.y);
                  }

                  elements.push(
                    <Path
                      key="lasso-current"
                      path={openPath}
                      color={lassoRenderColor}
                      style="stroke"
                      strokeWidth={2.5}
                      strokeJoin="round"
                      antiAlias
                    >
                      <DashPathEffect intervals={[10, 6]} />
                    </Path>,
                  );

                  // Vertex dots for current polygon
                  for (let i = 0; i < openVerts.length; i++) {
                    const vc = n2c(openVerts[i].x, openVerts[i].y);
                    const isDragging =
                      lassoDragVertex?.kind === 'open' &&
                      lassoDragVertex.vertexIndex === i;
                    const isCloseAnchor =
                      i === 0 && openVerts.length >= 3 && !isDragging;
                    const dotR = isDragging ? 7 : isCloseAnchor ? 6 : 4;
                    const dot = Skia.Path.Make();
                    const dotRect = Skia.XYWHRect(
                      vc.x - dotR,
                      vc.y - dotR,
                      dotR * 2,
                      dotR * 2,
                    );
                    dot.addOval(dotRect);
                    elements.push(
                      <Path
                        key={`lasso-dot-cur-${i}`}
                        path={dot}
                        color={isDragging ? '#FFFFFF' : lassoRenderColor}
                        style="fill"
                        antiAlias
                      />,
                    );
                    if (isDragging || isCloseAnchor) {
                      const ring = Skia.Path.Make();
                      const ringR = isCloseAnchor ? dotR + 5 : dotR;
                      ring.addOval(Skia.XYWHRect(
                        vc.x - ringR, vc.y - ringR, ringR * 2, ringR * 2,
                      ));
                      elements.push(
                        <Path
                          key={`lasso-dot-cur-ring-${i}`}
                          path={ring}
                          color={lassoRenderColor}
                          style="stroke"
                          strokeWidth={isCloseAnchor ? 1.5 : 2}
                          opacity={isCloseAnchor ? 0.65 : 1}
                          antiAlias
                        />,
                      );
                    }
                  }
                }
              }

              return elements;
            })()}
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
            hint: 'please select a brush color first',
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
    [],   // Create gesture object once; all callbacks read latest values via Ref to avoid Reanimated node conflicts during initialization
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
        if (isLassoActiveRef.current && lassoDragRef.current) {
          return;
        }
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

  // ── Gesture: lasso pointer (tap to place vertices + drag anchors) ───────
  const lassoPointerGesture = useMemo(
    () => {
      const applyVertexMove = (normX: number, normY: number) => {
        const drag = lassoDragRef.current;
        if (!drag) return;

        const maskData = regionMaskDataRef.current;
        const wallMask = buildWallMaskSampleFromRef(maskData);
        const point = wallMask
          ? resolveLassoWallDragPoint(
              normX, normY, wallMask, LASSO_EDGE_SNAP_SEG_PX,
            )
          : { x: normX, y: normY };
        if (!point) {
          return;
        }
        const excludePolyId =
          drag.kind === 'closed' ? drag.polyId : undefined;
        if (isNormPointOnAssignedWall(point.x, point.y, maskData)) {
          return;
        }
        if (
          isNormPointInCommittedLassoArea(
            point.x,
            point.y,
            manualWallRegionsRef.current,
            lassoPolygonsRef.current,
            excludePolyId,
          )
        ) {
          return;
        }

        lassoDragMovedRef.current = true;

        if (drag.kind === 'open') {
          setCurrentLassoVertices(prev => {
            if (!prev || drag.vertexIndex >= prev.length) return prev;
            const next = [...prev];
            next[drag.vertexIndex] = point;
            currentLassoVerticesRef.current = next;
            return next;
          });
          return;
        }

        if (drag.kind === 'closed' && drag.polyId) {
          setLassoPolygons(prev => {
            const poly = prev.get(drag.polyId!);
            if (!poly || drag.vertexIndex >= poly.vertices.length) return prev;
            const next = new Map(prev);
            const verts = [...poly.vertices];
            verts[drag.vertexIndex] = point;
            next.set(drag.polyId!, { ...poly, vertices: verts });
            lassoPolygonsRef.current = next;
            return next;
          });
        }
      };

      const performLassoTapJS = (sx: number, sy: number) => {
        const cw = canvasWRef.current;
        const ch = canvasHRef.current;
        if (cw <= 0 || ch <= 0) return;

        const canvasCoords = screenToCanvasCoords(
          sx, sy, cw, ch,
          zoomScaleRef.current, panOffsetRef.current,
        );

        const imgSz = imageSizeRef2.current;
        if (!imgSz) return;

        const rawNorm = canvasToNormalized(
          canvasCoords.x, canvasCoords.y, cw, ch, imgSz.w, imgSz.h,
        );
        if (!rawNorm) return;

        const wallMask = buildWallMaskSampleFromRef(regionMaskDataRef.current);
        const maskData = regionMaskDataRef.current;
        const norm = wallMask
          ? snapNormPointToWallCornerOrEdge(
              rawNorm.x, rawNorm.y, wallMask, LASSO_TAP_SNAP_SEG_PX,
            )
          : rawNorm;

        const em = energyMapRef.current;
        const isMagnetic = em != null;

        // Tap near the first vertex → close polygon
        if (currentLassoVerticesRef.current && currentLassoVerticesRef.current.length >= 3) {
          if (
            isNearOpenLassoFirstVertex(
              canvasCoords.x, canvasCoords.y,
              cw, ch, imgSz.w, imgSz.h,
              currentLassoVerticesRef.current,
              LASSO_CLOSE_THRESHOLD_PX,
            )
          ) {
            const openVerts = currentLassoVerticesRef.current;
            if (!openVerts || openVerts.length < 3) {
              return;
            }
            if (
              lassoPolygonUsesCommittedArea(
                openVerts,
                maskData,
                manualWallRegionsRef.current,
                lassoPolygonsRef.current,
              )
            ) {
              return;
            }
            const id = `lasso_${++lassoIdCounterRef.current}`;
            const polygon: LassoPolygon = {
              id,
              vertices: [...openVerts],
              isClosed: true,
            };
            setLassoPolygons(prev => {
              const next = new Map(prev);
              next.set(id, polygon);
              lassoPolygonsRef.current = next;
              return next;
            });
            setCurrentLassoVertices(null);
            currentLassoVerticesRef.current = null;
            return;
          }
        }


        if (
          !canPlaceLassoPointAt(
            norm.x,
            norm.y,
            maskData,
            wallMask,
            manualWallRegionsRef.current,
            lassoPolygonsRef.current,
          )
        ) {
          return;
        }

        const openVerts = currentLassoVerticesRef.current;
        if (openVerts && openVerts.length > 0) {
          for (let i = 0; i < openVerts.length; i++) {
            if (
              canvasDistToNormVertex(
                canvasCoords.x, canvasCoords.y,
                openVerts[i].x, openVerts[i].y,
                cw, ch, imgSz.w, imgSz.h,
              ) < LASSO_VERTEX_HIT_PX
            ) {
              return;
            }
          }
          const last = openVerts[openVerts.length - 1];
          if (
            canvasDistToNormVertex(
              canvasCoords.x, canvasCoords.y,
              last.x, last.y,
              cw, ch, imgSz.w, imgSz.h,
            ) < LASSO_MIN_VERTEX_SPACING_PX
          ) {
            return;
          }
        }

        // Magnetic lasso: snap path to edges between consecutive taps
        if (isMagnetic) {
          const prevVerts = currentLassoVerticesRef.current;
          if (prevVerts && prevVerts.length > 0) {
            const lastNorm = prevVerts[prevVerts.length - 1];
            const lastE = normToEnergyPoint(lastNorm.x, lastNorm.y, em);
            const tapE = normToEnergyPoint(norm.x, norm.y, em);

            const rawPath = findShortestPath(
              em.map,
              em.w,
              em.h,
              lastE.x,
              lastE.y,
              tapE.x,
              tapE.y,
              em.traversable,
            );
            const corners = extractCornerPoints(rawPath, 4, 1.0);
            const normPoints = energyPointsToNorm(corners, em)
              .filter(p =>
                canPlaceLassoPointAt(
                  p.x, p.y, maskData, wallMask,
                  manualWallRegionsRef.current,
                  lassoPolygonsRef.current,
                ),
              )
              .filter((p, i) => {
                if (i > 0) return true;
                const lastV = prevVerts[prevVerts.length - 1];
                return Math.hypot(p.x - lastV.x, p.y - lastV.y) > 0.0005;
              });

            if (normPoints.length === 0) {
              return;
            }

            setCurrentLassoVertices(prev => {
              if (!prev) return normPoints;
              const next = [...prev, ...normPoints];
              currentLassoVerticesRef.current = next;
              return next;
            });
            return;
          }
        }

        // Simple lasso: add single vertex
        setCurrentLassoVertices(prev => {
          const next = prev ? [...prev, norm] : [norm];
          currentLassoVerticesRef.current = next;
          return next;
        });
      };

      const onBeginJS = (sx: number, sy: number) => {
        lassoPendingTapRef.current = { x: sx, y: sy };
        lassoDragMovedRef.current = false;
        lassoVertexCandidateRef.current = null;

        const cw = canvasWRef.current;
        const ch = canvasHRef.current;
        const imgSz = imageSizeRef2.current;
        if (!imgSz || cw <= 0 || ch <= 0) return;

        const coords = screenToCanvasCoords(
          sx, sy, cw, ch,
          zoomScaleRef.current, panOffsetRef.current,
        );

        const openVerts = currentLassoVerticesRef.current;
        const drawingOpen = openVerts != null && openVerts.length > 0;

        const hit = findLassoVertexHit(
          coords.x, coords.y,
          cw, ch, imgSz.w, imgSz.h,
          LASSO_VERTEX_HIT_PX,
          openVerts,
          lassoPolygonsRef.current,
          { openOnly: drawingOpen },
        );
        if (hit) {
          lassoVertexCandidateRef.current = hit;
        }
      };

      const onUpdateJS = (sx: number, sy: number) => {
        if (lassoDragRef.current) {
          const cw = canvasWRef.current;
          const ch = canvasHRef.current;
          const imgSz = imageSizeRef2.current;
          if (!imgSz || cw <= 0 || ch <= 0) return;

          const coords = screenToCanvasCoords(
            sx, sy, cw, ch,
            zoomScaleRef.current, panOffsetRef.current,
          );
          const norm = canvasToNormalized(
            coords.x, coords.y, cw, ch, imgSz.w, imgSz.h,
          );
          if (!norm) return;

          applyVertexMove(norm.x, norm.y);
          return;
        }

        const pending = lassoPendingTapRef.current;
        if (!pending) return;

        const moved = Math.hypot(sx - pending.x, sy - pending.y);
        if (moved > LASSO_TAP_CANCEL_PX && !lassoVertexCandidateRef.current) {
          lassoPendingTapRef.current = null;
          return;
        }

        const candidate = lassoVertexCandidateRef.current;
        if (!candidate || moved < LASSO_DRAG_ACTIVATE_PX) {
          return;
        }

        lassoDragRef.current = candidate;
        lassoVertexCandidateRef.current = null;
        lassoPendingTapRef.current = null;
        setLassoDragVertex(candidate);
      };

      const onEndJS = (sx: number, sy: number) => {
        if (lassoDragRef.current) {
          lassoDragRef.current = null;
          lassoDragMovedRef.current = false;
          lassoVertexCandidateRef.current = null;
          setLassoDragVertex(null);
          return;
        }

        lassoVertexCandidateRef.current = null;
        const pending = lassoPendingTapRef.current;
        lassoPendingTapRef.current = null;
        if (pending) {
          performLassoTapJS(pending.x, pending.y);
        }
      };

      return Gesture.Pan()
        .minPointers(1)
        .maxPointers(1)
        .minDistance(0)
        .onBegin((e) => {
          'worklet';
          runOnJS(onBeginJS)(e.x, e.y);
        })
        .onUpdate((e) => {
          'worklet';
          runOnJS(onUpdateJS)(e.x, e.y);
        })
        .onEnd((e) => {
          'worklet';
          runOnJS(onEndJS)(e.x, e.y);
        })
        .onFinalize((e) => {
          'worklet';
          runOnJS(onEndJS)(e.x, e.y);
        });
    },
    [],
  );

  // ── Composed: pinch + pan simultaneous; tap only when neither claims ───
  // When lasso mode is active, swap the normal paint tap for lasso pointer.
  const composedGesture = useMemo(
    () => {
      if (isLassoActive) {
        return Gesture.Simultaneous(pinchGesture, lassoPointerGesture);
      }
      return Gesture.Exclusive(
        Gesture.Simultaneous(pinchGesture, panGesture),
        tapGesture,
      );
    },
    [isLassoActive, tapGesture, lassoPointerGesture, pinchGesture, panGesture],
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
          <GestureDetector key={isLassoActive ? 'lasso' : 'paint'} gesture={composedGesture}>
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
