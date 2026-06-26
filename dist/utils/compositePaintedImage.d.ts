import type { BgrColor, SavePaintResult } from '../components/MaskSegmentCanvas.types';
import type { SkImage } from '@shopify/react-native-skia';
export type CompositePaintInput = {
    originBuffer: Uint8Array;
    cols: number;
    rows: number;
    pickBuffer: Uint8Array;
    paintedRegions: Map<number, BgrColor>;
    destDir?: string;
    /**
     * Preferred path for rich export: PNG base64 from makeImageSnapshot() — written
     * directly to disk without an extra decode/re-encode round trip.
     */
    exportPngBase64?: string;
    /**
     * Preferred path for rich export: if the caller (MaskSegmentCanvas) provides bytes
     * that were produced by makeImageSnapshot() on a high-resolution Canvas rendering the
     * exact same PaintShaderLayer + regionPaint SkSL at work resolution, we write them
     * directly. This captures the live editor 质感 (lighting + high/low-freq texture)
     * without CPU pixel math and without a second declarative drawAsImage.
     */
    exportPngBytes?: Uint8Array;
    /**
     * Fallback rich path (when no pre-captured snapshot bytes): pass the live textures
     * so we can try renderPaintedImageOffscreen (drawAsImage with the shader tree).
     */
    shaderTextures?: {
        originImage: SkImage;
        paintColorMap: SkImage;
        lowFreqImage: SkImage;
        highFreqImage: SkImage;
    };
    /** The logical size at which to render the shader tree for export (typically the work image res). */
    renderWidth?: number;
    renderHeight?: number;
};
/** 将上色区域导出为 recolored PNG。
 * 优先级（从好到保底）：
 * 1. exportPngBytes（调用方用 makeImageSnapshot 在高分辨率 Canvas 上捕获的完整 shader 结果）—— 推荐的“保存快照”路径，无 CPU 逐像素，无二次 drawAsImage。
 * 2. shaderTextures + render*（通过 renderPaintedImageOffscreen / drawAsImage 重建同一套 PaintShaderLayer + SkSL）。
 * 3. CPU 逐像素 recolor（flat，无光照/纹理，仅作最后兜底，保证保存不中断）。
 */
export declare function compositePaintedImage(input: CompositePaintInput): Promise<SavePaintResult>;
//# sourceMappingURL=compositePaintedImage.d.ts.map