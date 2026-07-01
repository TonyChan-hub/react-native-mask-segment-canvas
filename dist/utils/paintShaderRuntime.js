import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Skia, Shader, ImageShader, Group, Rect, drawAsImage, } from '@shopify/react-native-skia';
import { REGION_PAINT_SKSL } from '../shaders/regionPaint.sksl';
import { getMaskSegmentRuntimeConfig } from './maskSegmentRuntime';
import { buildPaintColorMapImage } from './paintColorMapTexture';
let cachedEffect = null;
export function getRegionPaintEffect() {
    if (cachedEffect) {
        return cachedEffect;
    }
    const effect = Skia.RuntimeEffect.Make(REGION_PAINT_SKSL);
    if (!effect) {
        throw new Error('regionPaint SkSL compile failed');
    }
    cachedEffect = effect;
    return effect;
}
export function buildPaintShaderUniforms(showOrigin) {
    const paintCfg = getMaskSegmentRuntimeConfig().paint;
    return {
        colorBaseOpacity: paintCfg.colorBaseOpacity,
        lLightOpacity: paintCfg.lLightOpacity,
        textureOpacity: paintCfg.textureOpacity,
        showOrigin: showOrigin ? 1 : 0,
    };
}
function createPaintShaderTree(props) {
    const { originImage, paintColorMap, lowFreqImage, highFreqImage, x, y, width, height, showOrigin = false, } = props;
    const effect = getRegionPaintEffect();
    const uniforms = buildPaintShaderUniforms(showOrigin);
    const imageShaderProps = {
        fit: 'fill',
        tx: 'clamp',
        ty: 'clamp',
        rect: { x, y, width, height },
    };
    return (_jsx(Rect, { x: x, y: y, width: width, height: height, children: _jsxs(Shader, { source: effect, uniforms: uniforms, children: [_jsx(ImageShader, { image: originImage, ...imageShaderProps }), _jsx(ImageShader, { image: paintColorMap, ...imageShaderProps }), _jsx(ImageShader, { image: lowFreqImage, ...imageShaderProps }), _jsx(ImageShader, { image: highFreqImage, ...imageShaderProps })] }) }));
}
/** Canvas 内全屏上色 Shader 层 */
export function PaintShaderLayer(props) {
    return createPaintShaderTree(props);
}
export function createPaintColorMapForPaint(pickBuffer, cols, rows, paintedRegions) {
    const paintCfg = getMaskSegmentRuntimeConfig().paint;
    // Prefer color feather for the recolor application alpha (controls soft edge blend for both base color and texture overlay).
    // texture feather kept in config for future differentiation (e.g. high-freq strength roll-off).
    const feather = paintCfg.maskFeatherColor ?? 0;
    return buildPaintColorMapImage(pickBuffer, cols, rows, paintedRegions, feather);
}
/** 离屏渲染与预览同源的 shader 合成图 */
export async function renderPaintedImageOffscreen(input) {
    const { width, height, showOrigin = false, ...textures } = input;
    if (!textures.originImage || !textures.paintColorMap || !textures.lowFreqImage || !textures.highFreqImage) {
        console.warn('[VIZ-SAVE] renderPaintedImageOffscreen: missing one or more shader textures, will fallback');
        return null;
    }
    // drawAsImage expects the *scene content*, not a <Canvas> host component.
    // Passing a <Canvas> could cause the internal player to construct paints with
    // undefined values (leading to k.charAt errors in color/enum code).
    const element = (_jsx(Group, { children: createPaintShaderTree({
            ...textures,
            x: 0,
            y: 0,
            width,
            height,
            showOrigin,
        }) }));
    return drawAsImage(element, { width, height });
}
export function releasePaintShaderTextures(textures) {
    textures.originImage?.dispose();
    textures.paintColorMap?.dispose();
    textures.lowFreqImage?.dispose();
    textures.highFreqImage?.dispose();
}
//# sourceMappingURL=paintShaderRuntime.js.map