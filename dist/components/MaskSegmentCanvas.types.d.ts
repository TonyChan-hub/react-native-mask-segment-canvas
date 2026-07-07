import type { StyleProp, ViewStyle } from 'react-native';
import type { SegmentRegion } from '../utils/maskSegmentation';
import type { MaskSemanticColor } from '../utils/maskSemanticPalette';
export type BgrColor = {
    b: number;
    g: number;
    r: number;
};
export type MaskSegmentWatchState = 'init' | 'images_loaded' | 'mask_aligned' | 'mask_sampled' | 'regions_ready' | 'layers_ready' | 'interactive' | 'mask_paths_ready' | 'error';
export type MaskSegmentWatchDetail = {
    regionCount?: number;
    maskPathsReady?: boolean;
    freqLayersReady?: boolean;
    errorMessage?: string;
};
export type PipelinePreset = 'high' | 'medium' | 'low';
export type PipelineConfig = {
    maxImageLongSide?: number;
    /**  low/high frequency LAB processing longest side (can be lower than maxImageLongSide, Shader stretch sampling) */
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
    /** only used in wall mask, split wall into wall-1, wall-2... by texture boundary */
    splitWalls?: boolean;
    /** wall mask only, max number of wall sub-regions */
    splitWallsMaxCount?: number;
    /** wall mask only, min area ratio (relative to seg total pixels) */
    splitWallsMinAreaRatio?: number;
    /** wall mask only, Lab chroma + high-frequency texture feature distance squared threshold (excluding brightness, reducing shadow impact) */
    splitWallsColorDistSq?: number;
    /** wall mask only, chroma smoothing radius (pixels), only used for texture energy calculation */
    splitWallsChromaBlurRadius?: number;
    /** wall mask only, low saturation (white/gray wall) junction radius, used to force separate colored walls */
    splitWallsNeutralChromaMax?: number;
    /**
     * Wall split: raw per-channel BGR Sobel gradient threshold for edge barriers
     * (0 = disabled). Uses un-normalized 8‑bit Sobel magnitude on each B/G/R
     * channel (max per pixel, range ≈ 0–1442). Visible wall seams ≈ 120–280,
     * subtle lighting gradients ≈ 20–80. Default: 160.
     */
    splitWallsEdgeBarrierThreshold?: number;
    /**
     * Morphological close radius for wall mask holes before component labeling.
     * Non-wall pixels inside the wall boundary (windows, doors, mask artefacts)
     * are temporarily filled so the BFS can bridge across them. Default: 3.
     * Set to 0 to disable.
     */
    splitWallsCloseMaskRadius?: number;
    /** When true, disables automatic texture-based wall splitting (splitWalls). Manual lasso partitioning is used instead. */
    manualSplitWalls?: boolean;
    /** wall mask only, max number of manual wall sub-regions defined by lasso */
    manualSplitWallsMaxCount?: number;
    /**
     * Manual lasso: morphological dilation radius (seg pixels) used to merge thin
     * unassigned wall pockets adjacent to the drawn polygon.
     */
    manualSplitWallsGapAbsorbDilatePx?: number;
    /** When true, lasso mode uses edge-snapping (Sobel gradient + Dijkstra shortest-path). Default: false. */
    magneticLasso?: boolean;
    /** After End Lasso, run active contour refinement on each polygon to expand vertices outward toward wall-mask edges. Default: false. */
    activeContourRefine?: boolean;
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
    /** brush not selected, hint text */
    hint: string;
    regionId: number;
    regionName: string;
};
export type PaintCallbackPayload = PaintSuccessPayload | PaintBrushRequiredPayload;
/** A lasso polygon defined by user tapping vertices on the wall mask area. Vertices are in normalized image coordinates (0..1). */
export type LassoPolygon = {
    id: string;
    vertices: {
        x: number;
        y: number;
    }[];
    isClosed: boolean;
};
/** Result of converting a lasso polygon into an actual wall sub-region. */
export type ManualWallPartition = {
    id: string;
    regionId: number;
    regionName: string;
    vertices: {
        x: number;
        y: number;
    }[];
    bbox: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    area: number;
};
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
    /** Enter lasso mode — user can tap wall mask area to place polygon vertices. */
    startLasso: () => void;
    /** Exit lasso mode, convert all closed lasso polygons into wall-X sub-regions for painting. Returns the partition results. */
    endLasso: () => ManualWallPartition[];
    /**
     * Exit the current lasso editing session without saving regions.
     * Discards in-progress vertices and closed polygons from this session only;
     * previously committed manual wall partitions are kept.
     */
    cancelLasso: () => void;
    /** Get the current manual wall partitions (only valid after endLasso has been called). */
    getManualRegions: () => ManualWallPartition[];
    /** Delete a lasso polygon by its id. Committed partitions also drop paint on that region. */
    deleteLasso: (id: string) => void;
};
export type MaskSegmentCanvasProps = {
    originUrl?: string;
    maskUrl?: string;
    /** @deprecated use originUrl */
    originImgPath?: string;
    /** @deprecated use maskUrl */
    maskImgPath?: string;
    /** mask semantic recognition colors, initialization configuration; equivalent to maskConfig.semanticColors */
    semanticColors?: MaskSemanticColor[];
    /** partition dashed outline highlight color, initialization configuration; equivalent to paintConfig.regionOverlayFill */
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
    onWatch?: (state: MaskSegmentWatchState, durationMs: number, detail?: MaskSegmentWatchDetail) => void;
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
