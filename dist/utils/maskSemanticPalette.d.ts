export type MaskSemanticColor = {
    name: string;
    hex: string;
    /** 参考色（BGR，与掩码 buffer 通道一致） */
    bgr: {
        b: number;
        g: number;
        r: number;
    };
};
/** 掩码语义色表（与后端分区颜色参考一致） */
export declare const MASK_SEMANTIC_COLORS: MaskSemanticColor[];
export declare const BASEBOARD_SEMANTIC_NAME = "baseboard";
/** 将掩码像素归类到最近的语义色（baseboard 仅严格橙色命中） */
export declare function classifyBgrPixelToSemantic(b: number, g: number, r: number): string;
export declare function getSemanticColorByName(name: string): MaskSemanticColor | undefined;
/**
 * 踢脚线须更接近 #F58231 且明显优于黄柜 / 蓝墙，避免整块黄区被误判。
 */
export declare function isStrictBaseboardPixel(b: number, g: number, r: number): boolean;
export declare function isBaseboardPixel(b: number, g: number, r: number): boolean;
/** 掩码上墙/柜交界细条的量化色 */
export declare const BASEBOARD_STRIP_QUANT_KEYS: Set<string>;
/** 掩码上墙面量化色 */
export declare const WALL_QUANT_KEYS: Set<string>;
/** 掩码上柜/地面量化色 */
export declare const CABINET_QUANT_KEYS: Set<string>;
export declare function getBaseboardStripQuantKeys(): Set<string>;
export declare function getWallQuantKeys(): Set<string>;
export declare function getCabinetQuantKeys(): Set<string>;
//# sourceMappingURL=maskSemanticPalette.d.ts.map