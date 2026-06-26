import React from 'react';
import { type SkImage, type SkRuntimeEffect } from '@shopify/react-native-skia';
import type { BgrColor } from '../components/MaskSegmentCanvas.types';
export declare function getRegionPaintEffect(): SkRuntimeEffect;
export type PaintShaderTextures = {
    originImage: SkImage;
    paintColorMap: SkImage;
    lowFreqImage: SkImage;
    highFreqImage: SkImage;
};
export declare function buildPaintShaderUniforms(showOrigin: boolean): {
    colorBaseOpacity: number;
    lLightOpacity: number;
    textureOpacity: number;
    showOrigin: number;
};
export type PaintShaderLayerProps = PaintShaderTextures & {
    x: number;
    y: number;
    width: number;
    height: number;
    showOrigin?: boolean;
};
/** Canvas 内全屏上色 Shader 层 */
export declare function PaintShaderLayer(props: PaintShaderLayerProps): React.JSX.Element;
export declare function createPaintColorMapForPaint(pickBuffer: Uint8Array, cols: number, rows: number, paintedRegions: Map<number, BgrColor>): SkImage;
export type OffscreenPaintInput = PaintShaderTextures & {
    width: number;
    height: number;
    showOrigin?: boolean;
};
/** 离屏渲染与预览同源的 shader 合成图 */
export declare function renderPaintedImageOffscreen(input: OffscreenPaintInput): Promise<SkImage | null>;
export declare function releasePaintShaderTextures(textures: {
    originImage?: SkImage | null;
    paintColorMap?: SkImage | null;
    lowFreqImage?: SkImage | null;
    highFreqImage?: SkImage | null;
}): void;
//# sourceMappingURL=paintShaderRuntime.d.ts.map