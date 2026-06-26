import { getMaskRuntimeRevision, getMaskSegmentRuntimeConfig, } from './maskSegmentRuntime';
/** 掩码语义色表（与后端分区颜色参考一致） */
export const MASK_SEMANTIC_COLORS = [
    { name: 'door', hex: '#E6194B', bgr: { b: 75, g: 25, r: 230 } },
    { name: 'ceiling', hex: '#3CB44B', bgr: { b: 75, g: 180, r: 60 } },
    { name: 'cabinet', hex: '#FFE119', bgr: { b: 25, g: 225, r: 255 } },
    { name: 'wall', hex: '#4363D8', bgr: { b: 216, g: 99, r: 67 } },
    { name: 'baseboard', hex: '#F58231', bgr: { b: 49, g: 130, r: 245 } },
    { name: 'windowFrame', hex: '#911EB4', bgr: { b: 180, g: 30, r: 145 } },
    { name: 'garageDoor', hex: '#46F0F0', bgr: { b: 240, g: 240, r: 70 } },
    { name: 'roof', hex: '#F032E6', bgr: { b: 230, g: 50, r: 240 } },
    { name: 'eave', hex: '#BCF60C', bgr: { b: 12, g: 246, r: 188 } },
];
export const BASEBOARD_SEMANTIC_NAME = 'baseboard';
let contextRevision = -1;
let cachedContext = null;
function buildSemanticRgb(colors) {
    return colors.map(entry => ({
        name: entry.name,
        rgb: {
            r: entry.bgr.r,
            g: entry.bgr.g,
            b: entry.bgr.b,
        },
    }));
}
function getSemanticContext() {
    const revision = getMaskRuntimeRevision();
    if (contextRevision === revision && cachedContext) {
        return cachedContext;
    }
    const mask = getMaskSegmentRuntimeConfig().mask;
    const semanticRgb = buildSemanticRgb(mask.semanticColors);
    const baseboardRgb = semanticRgb.find(entry => entry.name === BASEBOARD_SEMANTIC_NAME);
    const cabinetRgb = semanticRgb.find(entry => entry.name === 'cabinet');
    const wallRgb = semanticRgb.find(entry => entry.name === 'wall');
    const maxDist = mask.baseboardMaxColorDist;
    cachedContext = {
        baseboardMaxColorDistSq: maxDist * maxDist,
        semanticRgb,
        baseboardRgb,
        cabinetRgb,
        wallRgb,
    };
    contextRevision = revision;
    return cachedContext;
}
function colorDistanceSq(a, b) {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return dr * dr + dg * dg + db * db;
}
/** 将掩码像素归类到最近的语义色（baseboard 仅严格橙色命中） */
export function classifyBgrPixelToSemantic(b, g, r) {
    const ctx = getSemanticContext();
    const pixel = { r, g, b };
    const distToBaseboard = colorDistanceSq(pixel, ctx.baseboardRgb.rgb);
    const distToCabinet = colorDistanceSq(pixel, ctx.cabinetRgb.rgb);
    const distToWall = colorDistanceSq(pixel, ctx.wallRgb.rgb);
    if (distToBaseboard <= ctx.baseboardMaxColorDistSq &&
        distToBaseboard < distToCabinet &&
        distToBaseboard < distToWall) {
        return BASEBOARD_SEMANTIC_NAME;
    }
    let best = ctx.semanticRgb[0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (const entry of ctx.semanticRgb) {
        if (entry.name === BASEBOARD_SEMANTIC_NAME) {
            continue;
        }
        const dist = colorDistanceSq(pixel, entry.rgb);
        if (dist < bestDist) {
            bestDist = dist;
            best = entry;
        }
    }
    return best.name;
}
export function getSemanticColorByName(name) {
    const colors = getMaskSegmentRuntimeConfig().mask.semanticColors;
    return colors.find(entry => entry.name === name);
}
/**
 * 踢脚线须更接近 #F58231 且明显优于黄柜 / 蓝墙，避免整块黄区被误判。
 */
export function isStrictBaseboardPixel(b, g, r) {
    const ctx = getSemanticContext();
    const pixel = { r, g, b };
    const distToBaseboard = colorDistanceSq(pixel, ctx.baseboardRgb.rgb);
    const distToCabinet = colorDistanceSq(pixel, ctx.cabinetRgb.rgb);
    const distToWall = colorDistanceSq(pixel, ctx.wallRgb.rgb);
    return (distToBaseboard <= ctx.baseboardMaxColorDistSq &&
        distToBaseboard < distToCabinet &&
        distToBaseboard < distToWall);
}
export function isBaseboardPixel(b, g, r) {
    return isStrictBaseboardPixel(b, g, r);
}
/** 掩码上墙/柜交界细条的量化色 */
export const BASEBOARD_STRIP_QUANT_KEYS = new Set(['0,255,255', '64,255,255']);
/** 掩码上墙面量化色 */
export const WALL_QUANT_KEYS = new Set([
    '192,128,64',
    '192,64,64',
    '128,64,64',
    '192,192,128',
    '128,128,64',
]);
/** 掩码上柜/地面量化色 */
export const CABINET_QUANT_KEYS = new Set([
    '0,192,255',
    '64,192,255',
    '128,192,255',
]);
export function getBaseboardStripQuantKeys() {
    return getMaskSegmentRuntimeConfig().mask.baseboardStripQuantKeys;
}
export function getWallQuantKeys() {
    return getMaskSegmentRuntimeConfig().mask.wallQuantKeys;
}
export function getCabinetQuantKeys() {
    return getMaskSegmentRuntimeConfig().mask.cabinetQuantKeys;
}
//# sourceMappingURL=maskSemanticPalette.js.map