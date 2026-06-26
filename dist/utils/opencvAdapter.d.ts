import { DataTypes, ColorConversionCodes, ThresholdTypes, MorphShapes, MorphTypes, RetrievalModes, ContourApproximationModes, InterpolationFlags, type Mat, type PointVector } from 'react-native-fast-opencv';
import type { SkImage } from '@shopify/react-native-skia';
type Point = {
    x: number;
    y: number;
};
type BBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};
type BgrColor = {
    b: number;
    g: number;
    r: number;
};
export declare class WrappedMat {
    readonly mat: Mat;
    cols: number;
    rows: number;
    readonly channels: number;
    constructor(mat: Mat, cols: number, rows: number, channels?: number);
    release(): void;
    clone(): Promise<WrappedMat>;
}
export declare class ContourWrapper {
    readonly pointVector: PointVector;
    constructor(pointVector: PointVector);
    release(): void;
}
declare const cv: {
    IMREAD_GRAYSCALE: number;
    THRESH_BINARY: ThresholdTypes;
    MORPH_RECT: MorphShapes;
    MORPH_ELLIPSE: MorphShapes;
    MORPH_OPEN: MorphTypes;
    MORPH_CLOSE: MorphTypes;
    RETR_EXTERNAL: RetrievalModes;
    CHAIN_APPROX_SIMPLE: ContourApproximationModes;
    CHAIN_APPROX_NONE: ContourApproximationModes;
    COLOR_BGR2GRAY: ColorConversionCodes;
    COLOR_BGR2Lab: ColorConversionCodes;
    COLOR_Lab2BGR: ColorConversionCodes;
    COLOR_GRAY2BGR: ColorConversionCodes;
    CV_8UC1: DataTypes;
    CV_16SC1: DataTypes;
    INTER_LINEAR: InterpolationFlags;
    INTER_NEAREST: InterpolationFlags;
    ensurePngPath(path: string, cacheFileName?: string): Promise<string>;
    imread(path: string, flags?: number): Promise<WrappedMat>;
    createMat(cols: number, rows: number, channels?: 1 | 3 | 4): WrappedMat;
    cvtColor(src: WrappedMat, code: ColorConversionCodes): Promise<WrappedMat>;
    /** 三通道色彩空间转换（BGR/Lab 等） */
    cvtColorBgr(src: WrappedMat, code: ColorConversionCodes): WrappedMat;
    /** 灰度 Mat → 三通道 BGR（供 Skia 显示） */
    grayToBgr(src: WrappedMat): WrappedMat;
    /** 掩码统一为三通道 BGR；已是 3 通道则原样返回，色序由分割侧 swapBr 检测 */
    ensureBgr3(src: WrappedMat): Promise<WrappedMat>;
    /** JS 二值缓冲（0/255）→ 单通道 Mat */
    binaryBufferToMat(buffer: Uint8Array, cols: number, rows: number): WrappedMat;
    /** 连续 BGR 缓冲 → 三通道 Mat */
    bgrBufferToMat(buffer: Uint8Array, cols: number, rows: number): WrappedMat;
    /** 将 JS 侧生成的灰度二值图写入临时 PGM 并读回 Mat */
    grayBufferToMat(gray: Uint8Array, cols: number, rows: number): Promise<WrappedMat>;
    /**
     * 导出 Mat 像素。先 clone 保证内存连续，避免原生 matToBuffer 忽略 step 导致行错位。
     */
    matToBuffer(src: WrappedMat): {
        buffer: Uint8Array;
        cols: number;
        rows: number;
        channels: number;
    };
    inRangeBgr(src: WrappedMat, color: BgrColor, tolerance: number, dst: WrappedMat): Promise<void>;
    resize(src: WrappedMat, dst: WrappedMat, size: {
        width: number;
        height: number;
    }, interpolation?: InterpolationFlags): Promise<void>;
    /** BGR 缓冲原生缩放（掩码用语义色，默认最近邻） */
    resizeBgrBuffer(buffer: Uint8Array, srcCols: number, srcRows: number, dstCols: number, dstRows: number, interpolation?: InterpolationFlags): Promise<Uint8Array>;
    /** BGR Mat → RGBA 连续缓冲（供 Skia 直传） */
    matToRgbaBuffer(src: WrappedMat): Promise<{
        buffer: Uint8Array;
        cols: number;
        rows: number;
    }>;
    /** BGR Mat → Skia 图像（跳过低频/高频 PNG 编码） */
    matToSkiaImage(src: WrappedMat): Promise<SkImage | null>;
    /** 单通道灰度 Mat → Skia RGBA（跳过 BGR 伪彩 + 四通道 matToBuffer） */
    grayMatToSkiaImage(src: WrappedMat): SkImage | null;
    /** 连续 BGR 缓冲 → Skia 图像（工作分辨率原图 / 高低频，复用 OpenCV 解码结果） */
    bgrBufferToSkiaImage(buffer: Uint8Array, cols: number, rows: number): Promise<SkImage | null>;
    threshold(src: WrappedMat, dst: WrappedMat, thresh: number, maxval: number, type: number): Promise<void>;
    getStructuringElement(shape: MorphShapes, ksize: {
        width: number;
        height: number;
    }): Promise<WrappedMat>;
    morphologyEx(src: WrappedMat, dst: WrappedMat, op: MorphTypes, kernel: WrappedMat): Promise<void>;
    findContours(image: WrappedMat, mode: RetrievalModes, method: ContourApproximationModes): Promise<ContourWrapper[]>;
    contourArea(contour: ContourWrapper): Promise<number>;
    boundingRect(contour: ContourWrapper): Promise<BBox>;
    arcLength(contour: ContourWrapper, closed: boolean): Promise<number>;
    approxPolyDP(contour: ContourWrapper, epsilon: number, closed: boolean): Promise<Point[]>;
    GaussianBlur(src: WrappedMat, dst: WrappedMat, ksize: {
        width: number;
        height: number;
    }, sigma: number): Promise<void>;
    extractChannel(src: WrappedMat, dst: WrappedMat, channel: number): void;
    convertTo(src: WrappedMat, dst: WrappedMat, rtype: number, alpha?: number, beta?: number): void;
    subtract(src1: WrappedMat, src2: WrappedMat, dst: WrappedMat): Promise<void>;
    addWeighted(src1: WrappedMat, alpha: number, src2: WrappedMat | null, beta: number, gamma: number, dst: WrappedMat): Promise<void>;
    imwrite(path: string, mat: WrappedMat): Promise<void>;
};
export default cv;
//# sourceMappingURL=opencvAdapter.d.ts.map