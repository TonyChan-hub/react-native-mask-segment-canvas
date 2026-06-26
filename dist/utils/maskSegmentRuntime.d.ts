import { type MaskSemanticColor } from './maskSemanticPalette';
import type { InteractionConfig, MaskSegmentConfig, PaintConfig, PipelineConfig, PipelinePreset } from '../components/MaskSegmentCanvas.types';
/** high */
export declare const PIPELINE_HIGH: Required<PipelineConfig>;
/** middle */
export declare const PIPELINE_MEDIUM: Required<PipelineConfig>;
/** low */
export declare const PIPELINE_LOW: Required<PipelineConfig>;
export declare const PIPELINE_PRESETS: Record<PipelinePreset, Required<PipelineConfig>>;
export declare const DEFAULT_PIPELINE_CONFIG: Required<PipelineConfig>;
export declare function resolvePipelineConfig(preset?: PipelinePreset, overrides?: PipelineConfig): Required<PipelineConfig>;
export declare const DEFAULT_PAINT_CONFIG: Required<PaintConfig>;
export declare const DEFAULT_INTERACTION_CONFIG: Required<InteractionConfig>;
export declare const DEFAULT_MASK_CONFIG: Required<Omit<MaskSegmentConfig, 'baseboardStripQuantKeys' | 'wallQuantKeys' | 'cabinetQuantKeys' | 'secondarySemanticNames'>> & {
    baseboardStripQuantKeys: Set<string>;
    wallQuantKeys: Set<string>;
    cabinetQuantKeys: Set<string>;
    secondarySemanticNames: Set<string>;
    semanticColors: MaskSemanticColor[];
};
export type ResolvedMaskSegmentRuntime = {
    pipeline: Required<PipelineConfig>;
    mask: typeof DEFAULT_MASK_CONFIG;
    paint: Required<PaintConfig>;
    interaction: Required<InteractionConfig>;
};
export declare function mergeMaskConfig(partial?: MaskSegmentConfig): typeof DEFAULT_MASK_CONFIG;
export declare function createRuntimeConfig(input?: {
    pipelineConfig?: PipelineConfig;
    maskConfig?: MaskSegmentConfig;
    paintConfig?: PaintConfig;
    interactionConfig?: InteractionConfig;
}): ResolvedMaskSegmentRuntime;
export declare function getMaskRuntimeRevision(): number;
export declare function setMaskSegmentRuntimeConfig(input?: {
    pipelineConfig?: PipelineConfig;
    maskConfig?: MaskSegmentConfig;
    paintConfig?: PaintConfig;
    interactionConfig?: InteractionConfig;
}): ResolvedMaskSegmentRuntime;
export declare function getMaskSegmentRuntimeConfig(): ResolvedMaskSegmentRuntime;
export declare function resetMaskSegmentRuntimeConfig(): ResolvedMaskSegmentRuntime;
//# sourceMappingURL=maskSegmentRuntime.d.ts.map