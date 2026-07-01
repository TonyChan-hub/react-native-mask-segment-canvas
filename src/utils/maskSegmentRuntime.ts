import {
  BASEBOARD_STRIP_QUANT_KEYS,
  CABINET_QUANT_KEYS,
  MASK_SEMANTIC_COLORS,
  WALL_QUANT_KEYS,
  type MaskSemanticColor,
} from './maskSemanticPalette';
import type {
  InteractionConfig,
  MaskSegmentConfig,
  PaintConfig,
  PipelineConfig,
  PipelinePreset,
  BgrColor,
} from '../components/MaskSegmentCanvas.types';
/** high */
export const PIPELINE_HIGH: Required<PipelineConfig> = {
  maxImageLongSide: 1440,
  paintFreqMaxLongSide: 960,
  originPreviewMaxLongSide: 720,
  maskPathMaxLongSide: 960,
  minContourArea: 50,
  contourApproxEpsilon: 0.002,
  maxRegions: 800,
};

/** middle */
export const PIPELINE_MEDIUM: Required<PipelineConfig> = {
  maxImageLongSide: 720,
  paintFreqMaxLongSide: 480,
  originPreviewMaxLongSide: 360,
  maskPathMaxLongSide: 480,
  minContourArea: 100,
  contourApproxEpsilon: 0.003,
  maxRegions: 500,
};

/** low */
export const PIPELINE_LOW: Required<PipelineConfig> = {
  maxImageLongSide: 360,
  paintFreqMaxLongSide: 240,
  originPreviewMaxLongSide: 180,
  maskPathMaxLongSide: 240,
  minContourArea: 200,
  contourApproxEpsilon: 0.005,
  maxRegions: 300,
};
export const PIPELINE_PRESETS: Record<PipelinePreset, Required<PipelineConfig>> = {
  high: PIPELINE_HIGH,
  medium: PIPELINE_MEDIUM,
  low: PIPELINE_LOW,
};

export const DEFAULT_PIPELINE_CONFIG: Required<PipelineConfig> = PIPELINE_MEDIUM;

export function resolvePipelineConfig(
  preset?: PipelinePreset,
  overrides?: PipelineConfig,
): Required<PipelineConfig> {
  const base =
    preset != null ? PIPELINE_PRESETS[preset] : DEFAULT_PIPELINE_CONFIG;
  return { ...base, ...overrides };
}

const DEFAULT_PAINT_PALETTE: BgrColor[] = [
  { b: 138, g: 126, r: 110 },
  { b: 92, g: 124, r: 86 },
  { b: 70, g: 80, r: 158 },
  { b: 54, g: 134, r: 182 },
  { b: 128, g: 98, r: 142 },
  { b: 76, g: 120, r: 138 },
];

export const DEFAULT_PAINT_CONFIG: Required<PaintConfig> = {
  palette: DEFAULT_PAINT_PALETTE,
  // Optimized coloring: slightly stronger base color fidelity while preserving natural lighting.
  colorBaseOpacity: 0.88,
  lLightOpacity: 0.50,
  // Strengthened texture retention (high-freq detail overlay) for richer surface appearance after recolor.
  textureOpacity: 0.85,
  // Slightly tighter low-freq lighting kernel for cleaner wall/ceiling shading without over-smoothing.
  lLowBlurKernel: 7,
  lLowContrast: 1.10,
  lLowBrightness: 0.92,
  lHighGain: 1.22,
  // Edge handling: small positive feather produces soft transitions at painted region boundaries.
  // color feather drives the paintColorMap alpha softness (used by shader for blend-to-origin).
  maskFeatherColor: 1.6,
  maskFeatherTexture: 0.9,
  regionOverlayFill: '#FFC14D',
  regionOutlineStrokeWidth: 4,
};

export const DEFAULT_INTERACTION_CONFIG: Required<InteractionConfig> = {
  kickMaskPickRadiusPx: 36,
  pickMapSearchRadiusPx: 14,
  thinStripPadding: 0.008,
  regionPadding: 0.003,
  initRegionFlashMs: 1000,
  enableInitRegionFlash: true,
};

export const DEFAULT_MASK_CONFIG: Required<
  Omit<
    MaskSegmentConfig,
    | 'baseboardStripQuantKeys'
    | 'wallQuantKeys'
    | 'cabinetQuantKeys'
    | 'secondarySemanticNames'
  >
> & {
  baseboardStripQuantKeys: Set<string>;
  wallQuantKeys: Set<string>;
  cabinetQuantKeys: Set<string>;
  secondarySemanticNames: Set<string>;
  semanticColors: MaskSemanticColor[];
} = {
  semanticColors: MASK_SEMANTIC_COLORS,
  baseboardMaxColorDist: 42,
  blackThreshold: 30,
  quantStep: 64,
  baseboardStripQuantKeys: new Set(BASEBOARD_STRIP_QUANT_KEYS),
  wallQuantKeys: new Set(WALL_QUANT_KEYS),
  cabinetQuantKeys: new Set(CABINET_QUANT_KEYS),
  maxRegionColors: 6,
  secondarySemanticNames: new Set(['garageDoor', 'roof', 'eave']),
  secondaryMinPixelRatio: 0.002,
  junctionHRadiusPx: 24,
  junctionVRadiusPx: 2,
  kickBridgeHalfWPx: 6,
  baseboardJunctionRowMarginPx: 1,
  baseboardJunctionVReachPx: 2,
  baseboardMinRunPx: 2,
  splitWalls: false,
  splitWallsMaxCount: 8,
  splitWallsMinAreaRatio: 0.002,
  splitWallsColorDistSq: 1400,
  splitWallsChromaBlurRadius: 5,
  splitWallsNeutralChromaMax: 14,
};

export type ResolvedMaskSegmentRuntime = {
  pipeline: Required<PipelineConfig>;
  mask: typeof DEFAULT_MASK_CONFIG;
  paint: Required<PaintConfig>;
  interaction: Required<InteractionConfig>;
};

function toStringSet(values?: string[]): Set<string> {
  return new Set(values ?? []);
}

export function mergeMaskConfig(
  partial?: MaskSegmentConfig,
): typeof DEFAULT_MASK_CONFIG {
  if (!partial) {
    return { ...DEFAULT_MASK_CONFIG };
  }
  return {
    semanticColors: partial.semanticColors ?? DEFAULT_MASK_CONFIG.semanticColors,
    baseboardMaxColorDist:
      partial.baseboardMaxColorDist ?? DEFAULT_MASK_CONFIG.baseboardMaxColorDist,
    blackThreshold:
      partial.blackThreshold ?? DEFAULT_MASK_CONFIG.blackThreshold,
    quantStep: partial.quantStep ?? DEFAULT_MASK_CONFIG.quantStep,
    baseboardStripQuantKeys: partial.baseboardStripQuantKeys
      ? toStringSet(partial.baseboardStripQuantKeys)
      : new Set(DEFAULT_MASK_CONFIG.baseboardStripQuantKeys),
    wallQuantKeys: partial.wallQuantKeys
      ? toStringSet(partial.wallQuantKeys)
      : new Set(DEFAULT_MASK_CONFIG.wallQuantKeys),
    cabinetQuantKeys: partial.cabinetQuantKeys
      ? toStringSet(partial.cabinetQuantKeys)
      : new Set(DEFAULT_MASK_CONFIG.cabinetQuantKeys),
    maxRegionColors:
      partial.maxRegionColors ?? DEFAULT_MASK_CONFIG.maxRegionColors,
    secondarySemanticNames: partial.secondarySemanticNames
      ? toStringSet(partial.secondarySemanticNames)
      : new Set(DEFAULT_MASK_CONFIG.secondarySemanticNames),
    secondaryMinPixelRatio:
      partial.secondaryMinPixelRatio ??
      DEFAULT_MASK_CONFIG.secondaryMinPixelRatio,
    junctionHRadiusPx:
      partial.junctionHRadiusPx ?? DEFAULT_MASK_CONFIG.junctionHRadiusPx,
    junctionVRadiusPx:
      partial.junctionVRadiusPx ?? DEFAULT_MASK_CONFIG.junctionVRadiusPx,
    kickBridgeHalfWPx:
      partial.kickBridgeHalfWPx ?? DEFAULT_MASK_CONFIG.kickBridgeHalfWPx,
    baseboardJunctionRowMarginPx:
      partial.baseboardJunctionRowMarginPx ??
      DEFAULT_MASK_CONFIG.baseboardJunctionRowMarginPx,
    baseboardJunctionVReachPx:
      partial.baseboardJunctionVReachPx ??
      DEFAULT_MASK_CONFIG.baseboardJunctionVReachPx,
    baseboardMinRunPx:
      partial.baseboardMinRunPx ?? DEFAULT_MASK_CONFIG.baseboardMinRunPx,
    splitWalls: partial.splitWalls ?? DEFAULT_MASK_CONFIG.splitWalls,
    splitWallsMaxCount:
      partial.splitWallsMaxCount ?? DEFAULT_MASK_CONFIG.splitWallsMaxCount,
    splitWallsMinAreaRatio:
      partial.splitWallsMinAreaRatio ??
      DEFAULT_MASK_CONFIG.splitWallsMinAreaRatio,
    splitWallsColorDistSq:
      partial.splitWallsColorDistSq ??
      DEFAULT_MASK_CONFIG.splitWallsColorDistSq,
    splitWallsChromaBlurRadius:
      partial.splitWallsChromaBlurRadius ??
      DEFAULT_MASK_CONFIG.splitWallsChromaBlurRadius,
    splitWallsNeutralChromaMax:
      partial.splitWallsNeutralChromaMax ??
      DEFAULT_MASK_CONFIG.splitWallsNeutralChromaMax,
  };
}

export function createRuntimeConfig(input?: {
  pipelineConfig?: PipelineConfig;
  maskConfig?: MaskSegmentConfig;
  paintConfig?: PaintConfig;
  interactionConfig?: InteractionConfig;
}): ResolvedMaskSegmentRuntime {
  return {
    pipeline: {
      ...DEFAULT_PIPELINE_CONFIG,
      ...input?.pipelineConfig,
    },
    mask: mergeMaskConfig(input?.maskConfig),
    paint: {
      ...DEFAULT_PAINT_CONFIG,
      ...input?.paintConfig,
      palette: input?.paintConfig?.palette ?? DEFAULT_PAINT_CONFIG.palette,
    },
    interaction: {
      ...DEFAULT_INTERACTION_CONFIG,
      ...input?.interactionConfig,
    },
  };
}

let activeRuntime = createRuntimeConfig();
let runtimeRevision = 0;

export function getMaskRuntimeRevision(): number {
  return runtimeRevision;
}

export function setMaskSegmentRuntimeConfig(input?: {
  pipelineConfig?: PipelineConfig;
  maskConfig?: MaskSegmentConfig;
  paintConfig?: PaintConfig;
  interactionConfig?: InteractionConfig;
}): ResolvedMaskSegmentRuntime {
  activeRuntime = {
    pipeline: input?.pipelineConfig
      ? { ...activeRuntime.pipeline, ...input.pipelineConfig }
      : activeRuntime.pipeline,
    mask: input?.maskConfig
      ? mergeMaskConfig(input.maskConfig)
      : activeRuntime.mask,
    paint: input?.paintConfig
      ? { ...activeRuntime.paint, ...input.paintConfig }
      : activeRuntime.paint,
    interaction: input?.interactionConfig
      ? { ...activeRuntime.interaction, ...input.interactionConfig }
      : activeRuntime.interaction,
  };
  runtimeRevision += 1;
  return activeRuntime;
}

export function getMaskSegmentRuntimeConfig(): ResolvedMaskSegmentRuntime {
  return activeRuntime;
}

export function resetMaskSegmentRuntimeConfig(): ResolvedMaskSegmentRuntime {
  activeRuntime = createRuntimeConfig();
  runtimeRevision += 1;
  return activeRuntime;
}
