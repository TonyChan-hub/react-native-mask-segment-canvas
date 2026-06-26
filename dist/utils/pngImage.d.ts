import { type Mat } from 'react-native-fast-opencv';
export declare const PNG_EXT = ".png";
/** PNG 压缩级别 0 = 无损 */
export declare const PNG_COMPRESSION = 0;
export declare function normalizePath(path: string): string;
/** Skia useImage 需要 URI；OpenCV / RNFS 使用裸路径 */
export declare function toSkiaUri(path: string | null | undefined): string | null;
export declare function toPngFileName(name: string): string;
export declare function isPngPath(path: string): boolean;
/** 按文件元数据生成指纹，避免整文件读入（原 base64 全量哈希在 1.5MB 图上极慢） */
export declare function fileContentFingerprint(path: string): Promise<string>;
/** 任意图片路径 → 缓存目录下的 PNG 文件路径（已是 PNG 则复制，否则解码转存） */
export declare function ensurePngFile(sourcePath: string, cacheFileName: string): Promise<string>;
/** 根据源路径生成稳定 PNG 缓存名 */
export declare function pngCacheName(sourcePath: string, prefix: string): string;
/** 清理分割/OpenCV 派生缓存，保留原图与掩码源文件 */
export declare function clearDerivedImageCache(): Promise<number>;
type PngHeader = {
    width: number;
    height: number;
    bitDepth: number;
    colorType: number;
};
/** 从 base64 解析 PNG IHDR（不依赖 OpenCV），用于 16-bit Mat toJSValue 崩溃时的降级通路 */
export declare function readPngHeaderFromBase64(base64: string): PngHeader;
/** 16-bit / float Mat → 8-bit（fast-opencv 在 patch 前 toJSValue 会截断高位）。
 *  Semantic mask PNGs use 16-bit RGB where the label (0-255) is stored as value×257;
 *  use 1/257 scaling for 3+ channel 16-bit cases so the resulting 8-bit channels contain
 *  the original semantic label values (consistent with the native ensure8U patch).
 *
 *  pngHeader 可选：当 toJSValue 因 16-bit Mat 崩溃时，用 PNG 文件头信息做降级转换，
 *  绕过原生 toJSValue 调用。
 */
export declare function ensureMat8U(srcMat: Mat, pngHeader?: PngHeader): {
    mat: Mat;
    extraReleaseIds: string[];
};
export type PngBgrBuffer = {
    buffer: Uint8Array;
    cols: number;
    rows: number;
};
export declare function prewarmPngBgrCache(paths: string[]): void;
export declare function prewarmPngBgrCacheAsync(paths: string[]): Promise<void>;
export declare function pngContentCacheKey(path: string): Promise<string>;
export declare function readPngBgrBuffer(path: string): Promise<PngBgrBuffer>;
export declare function resizeBgrBuffer(buffer: Uint8Array, srcCols: number, srcRows: number, dstCols: number, dstRows: number): Uint8Array;
export {};
//# sourceMappingURL=pngImage.d.ts.map