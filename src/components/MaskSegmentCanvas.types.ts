import type { StyleProp, ViewStyle } from 'react-native';
import type { SegmentRegion } from '../utils/maskSegmentation';
import type { MaskSemanticColor } from '../utils/maskSemanticPalette';

export type BgrColor = { b: number; g: number; r: number };

export type MaskSegmentWatchState =
  | 'init'
  | 'images_loaded'
  | 'mask_aligned'
  | 'mask_sampled'
  | 'regions_ready'
  | 'layers_ready'
  | 'interactive'
  | 'mask_paths_ready'
  | 'error';

export type MaskSegmentWatchDetail = {
  regionCount?: number;
  maskPathsReady?: boolean;
  freqLayersReady?: boolean;
  errorMessage?: string;
};

export type PipelinePreset = 'high' | 'medium' | 'low';

export type PipelineConfig = {
  maxImageLongSide?: number;
  /** 高低频 LAB 处理最长边（可低于 maxImageLongSide，Shader 拉伸采样） */
  paintFreqMaxLongSide?: number;
  originPreviewMaxLongSide?: number;
  maskPathMaxLongSide?: number;
  minContourArea?: number;
  contourApproxEpsilon?: number;
  maxRegions?: number;
};

export type MaskSegmentConfig = {
  semanticColors?: MaskSemanticColor[];
  baseboardMaxColorDist?: number;
  blackThreshold?: number;
  quantStep?: number;
  baseboardStripQuantKeys?: string[];
  wallQuantKeys?: string[];
  cabinetQuantKeys?: string[];
  maxRegionColors?: number;
  secondarySemanticNames?: string[];
  secondaryMinPixelRatio?: number;
  junctionHRadiusPx?: number;
  junctionVRadiusPx?: number;
  kickBridgeHalfWPx?: number;
  baseboardJunctionRowMarginPx?: number;
  baseboardJunctionVReachPx?: number;
  baseboardMinRunPx?: number;
  /** 在 wall 掩码内按纹理边界细分为 wall-1、wall-2… */
  splitWalls?: boolean;
  /** 墙壁子区最大数量 */
  splitWallsMaxCount?: number;
  /** 碎块最小面积比（相对 seg 总像素） */
  splitWallsMinAreaRatio?: number;
  /** Lab 色度 + 高频纹理特征距离平方阈值（不含亮度，削弱光影影响） */
  splitWallsColorDistSq?: number;
  /** 色度平滑半径（像素），仅用于纹理能量计算 */
  splitWallsChromaBlurRadius?: number;
  /** 低饱和（白/灰墙）判定半径，用于与有色墙强制分界 */
  splitWallsNeutralChromaMax?: number;
};

export type PaintConfig = {
  palette?: BgrColor[];
  colorBaseOpacity?: number;
  lLightOpacity?: number;
  textureOpacity?: number;
  lLowBlurKernel?: number;
  lLowContrast?: number;
  lLowBrightness?: number;
  lHighGain?: number;
  maskFeatherColor?: number;
  maskFeatherTexture?: number;
  regionOverlayFill?: string;
  regionOutlineStrokeWidth?: number;
};

export type InteractionConfig = {
  kickMaskPickRadiusPx?: number;
  pickMapSearchRadiusPx?: number;
  thinStripPadding?: number;
  regionPadding?: number;
  initRegionFlashMs?: number;
  enableInitRegionFlash?: boolean;
};

export type PaintedRegionRecord = {
  regionId: number;
  regionName: string;
  color: BgrColor;
  configJson?: Record<string, unknown>;
};

export type MaskSegmentSession = {
  version: 1;
  originUrl: string;
  maskUrl: string;
  painted: PaintedRegionRecord[];
  paintHistory: number[];
  currentColor?: BgrColor;
  currentColorConfigJson?: Record<string, unknown>;
  savedAt: number;
};

export type SavePaintResult = {
  filePath: string;
  width: number;
  height: number;
  paintedCount: number;
  previewPath?: string;
};

export type SavePaintOptions = {
  destDir?: string;
};

export type PaintSuccessPayload = {
  kind: 'painted';
  regionId: number;
  regionName: string;
  color: BgrColor;
  configJson?: Record<string, unknown>;
};

export type PaintBrushRequiredPayload = {
  kind: 'brush_required';
  /** 未选笔刷时的提示文案 */
  hint: string;
  regionId: number;
  regionName: string;
};

export type PaintCallbackPayload = PaintSuccessPayload | PaintBrushRequiredPayload;

export type MaskSegmentCanvasRef = {
  reset: () => void;
  swap: (showOrigin?: boolean) => void;
  save: (options?: SavePaintOptions) => Promise<SavePaintResult>;
  session: () => MaskSegmentSession;
  loadSession: (session: MaskSegmentSession) => void;
  setPaintColor: (color: BgrColor, configJson?: Record<string, unknown>) => void;
  setMaskConfig: (config: MaskSegmentConfig) => void;
  clearAllPaint: () => void;
  /** Undo the most recent single coloring (paint) step. Distinct from clearAllPaint (full reset). */
  undoSelection?: () => void;
  resegment: () => Promise<void>;
  getRegions: () => SegmentRegion[];
  getPaintedRegions: () => PaintedRegionRecord[];
  /** Returns the most recent auto-export or save() result, if any. */
  getLastExport?: () => SavePaintResult | null;
};

export type MaskSegmentCanvasProps = {
  originUrl?: string;
  maskUrl?: string;
  /** @deprecated 使用 originUrl */
  originImgPath?: string;
  /** @deprecated 使用 maskUrl */
  maskImgPath?: string;
  /** 掩码语义识别色，初始化配置；等同 maskConfig.semanticColors */
  semanticColors?: MaskSemanticColor[];
  /** 分区虚线高亮色，初始化配置；等同 paintConfig.regionOverlayFill */
  regionOutlineColor?: string;
  maskConfig?: MaskSegmentConfig;
  /** Performance preset (high / medium / low). Merged with pipelineConfig overrides. */
  pipelinePreset?: PipelinePreset;
  pipelineConfig?: PipelineConfig;
  paintConfig?: PaintConfig;
  interactionConfig?: InteractionConfig;
  initialSession?: MaskSegmentSession;
  initialPaintColor?: BgrColor;
  initialPaintConfigJson?: Record<string, unknown>;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Max container height available for this component (px). When set, the SDK
   * computes canvas dimensions as a fit-contain within (screenWidth - 20, maxHeight)
   * instead of using the full image aspect at full screen width.
   */
  maxHeight?: number;
  onWatch?: (
    state: MaskSegmentWatchState,
    durationMs: number,
    detail?: MaskSegmentWatchDetail,
  ) => void;
  onPaintCallback?: (payload: PaintCallbackPayload) => void;
  onError?: (message: string, error?: unknown) => void;
  /**
   * When true, once the canvas reaches a ready interactive state (segmentation complete
   * + any initialSession / painted colors applied), the SDK will automatically call its
   * internal save pipeline to produce the recolored result image and fire onExported.
   * This moves "auto-generate After preview" capability inside the SDK.
   */
  autoExportOnReady?: boolean;
  /** Fired by SDK when autoExportOnReady produced a result (the recolored file). */
  onExported?: (result: SavePaintResult) => void;
};

export type { SegmentRegion, MaskSemanticColor };
