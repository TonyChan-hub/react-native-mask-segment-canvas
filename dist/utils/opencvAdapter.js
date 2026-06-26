/**
 * OpenCV 便捷适配层
 * 将 react-native-fast-opencv 的 invoke API 封装为 MaskSegmentCanvas 所需的 async 风格接口
 */
import RNFS from 'react-native-fs';
import { OpenCV, ObjectType, DataTypes, ColorConversionCodes, ThresholdTypes, MorphShapes, MorphTypes, RetrievalModes, ContourApproximationModes, InterpolationFlags, } from 'react-native-fast-opencv';
import { PNG_COMPRESSION, ensureMat8U, ensurePngFile, isPngPath, normalizePath, pngCacheName, readPngBgrBuffer, readPngHeaderFromBase64, } from './pngImage';
import { rgbaBufferToSkiaImage } from './skiaImage';
const IMREAD_GRAYSCALE = 0;
export class WrappedMat {
    mat;
    cols;
    rows;
    channels;
    constructor(mat, cols, rows, channels = 3) {
        this.mat = mat;
        this.cols = cols;
        this.rows = rows;
        this.channels = channels;
    }
    release() {
        OpenCV.releaseBuffers([this.mat.id]);
    }
    async clone() {
        const cloned = OpenCV.invoke('clone', this.mat);
        return new WrappedMat(cloned, this.cols, this.rows, this.channels);
    }
}
export class ContourWrapper {
    pointVector;
    constructor(pointVector) {
        this.pointVector = pointVector;
    }
    release() {
        OpenCV.releaseBuffers([this.pointVector.id]);
    }
}
function createScalar(a, b, c) {
    if (b === undefined) {
        return OpenCV.createObject(ObjectType.Scalar, a);
    }
    if (c === undefined) {
        return OpenCV.createObject(ObjectType.Scalar, a, b, 0);
    }
    return OpenCV.createObject(ObjectType.Scalar, a, b, c);
}
async function readImageFromPath(path, grayscale = false) {
    const filePath = normalizePath(path);
    const base64 = await RNFS.readFile(filePath, 'base64');
    const srcMat = OpenCV.base64ToMat(base64);
    // 16-bit PNG 降级: toJSValue 可能崩溃，先解析 PNG 头
    let pngHeader;
    try {
        pngHeader = readPngHeaderFromBase64(base64);
    }
    catch {
        // 非 PNG 不传
    }
    const { mat, extraReleaseIds } = ensureMat8U(srcMat, pngHeader);
    const info = OpenCV.toJSValue(mat);
    if (grayscale) {
        const gray = OpenCV.createObject(ObjectType.Mat, info.rows, info.cols, DataTypes.CV_8UC1);
        OpenCV.invoke('cvtColor', mat, gray, ColorConversionCodes.COLOR_BGR2GRAY);
        OpenCV.releaseBuffers([
            ...new Set([srcMat.id, mat.id, ...extraReleaseIds]),
        ]);
        return new WrappedMat(gray, info.cols, info.rows, 1);
    }
    const channels = info.type === DataTypes.CV_8UC1
        ? 1
        : info.type === DataTypes.CV_8UC4
            ? 4
            : 3;
    if (mat.id !== srcMat.id) {
        OpenCV.releaseBuffers([srcMat.id]);
    }
    return new WrappedMat(mat, info.cols, info.rows, channels);
}
function createSize(width, height) {
    return OpenCV.createObject(ObjectType.Size, width, height);
}
/** OpenCV GaussianBlur 要求核宽高为正奇数 */
function normalizeGaussianKernel(size) {
    const n = Math.max(1, Math.round(size));
    return n % 2 === 0 ? n + 1 : n;
}
const cv = {
    IMREAD_GRAYSCALE,
    THRESH_BINARY: ThresholdTypes.THRESH_BINARY,
    MORPH_RECT: MorphShapes.MORPH_RECT,
    MORPH_ELLIPSE: MorphShapes.MORPH_ELLIPSE,
    MORPH_OPEN: MorphTypes.MORPH_OPEN,
    MORPH_CLOSE: MorphTypes.MORPH_CLOSE,
    RETR_EXTERNAL: RetrievalModes.RETR_EXTERNAL,
    CHAIN_APPROX_SIMPLE: ContourApproximationModes.CHAIN_APPROX_SIMPLE,
    CHAIN_APPROX_NONE: ContourApproximationModes.CHAIN_APPROX_NONE,
    COLOR_BGR2GRAY: ColorConversionCodes.COLOR_BGR2GRAY,
    COLOR_BGR2Lab: ColorConversionCodes.COLOR_BGR2Lab,
    COLOR_Lab2BGR: ColorConversionCodes.COLOR_Lab2BGR,
    COLOR_GRAY2BGR: ColorConversionCodes.COLOR_GRAY2BGR,
    CV_8UC1: DataTypes.CV_8UC1,
    CV_16SC1: DataTypes.CV_16SC1,
    INTER_LINEAR: InterpolationFlags.INTER_LINEAR,
    INTER_NEAREST: InterpolationFlags.INTER_NEAREST,
    async ensurePngPath(path, cacheFileName) {
        const name = cacheFileName ?? pngCacheName(path, 'img');
        return ensurePngFile(path, name);
    },
    async imread(path, flags) {
        const filePath = normalizePath(path);
        if (isPngPath(filePath) && (await RNFS.exists(filePath))) {
            if (flags === IMREAD_GRAYSCALE) {
                return readImageFromPath(filePath, true);
            }
            const { buffer, cols, rows } = await readPngBgrBuffer(filePath);
            return cv.bgrBufferToMat(buffer, cols, rows);
        }
        const pngPath = await ensurePngFile(path, pngCacheName(path, 'imread'));
        if (flags === IMREAD_GRAYSCALE) {
            return readImageFromPath(pngPath, true);
        }
        const { buffer, cols, rows } = await readPngBgrBuffer(pngPath);
        return cv.bgrBufferToMat(buffer, cols, rows);
    },
    createMat(cols, rows, channels = 1) {
        const type = channels === 1
            ? DataTypes.CV_8UC1
            : channels === 3
                ? DataTypes.CV_8UC3
                : DataTypes.CV_8UC4;
        const mat = OpenCV.createObject(ObjectType.Mat, rows, cols, type);
        return new WrappedMat(mat, cols, rows, channels);
    },
    async cvtColor(src, code) {
        const dst = cv.createMat(src.cols, src.rows, 1);
        OpenCV.invoke('cvtColor', src.mat, dst.mat, code);
        return dst;
    },
    /** 三通道色彩空间转换（BGR/Lab 等） */
    cvtColorBgr(src, code) {
        const dst = cv.createMat(src.cols, src.rows, 3);
        OpenCV.invoke('cvtColor', src.mat, dst.mat, code);
        return dst;
    },
    /** 灰度 Mat → 三通道 BGR（供 Skia 显示） */
    grayToBgr(src) {
        const dst = cv.createMat(src.cols, src.rows, 3);
        OpenCV.invoke('cvtColor', src.mat, dst.mat, ColorConversionCodes.COLOR_GRAY2BGR);
        return dst;
    },
    /** 掩码统一为三通道 BGR；已是 3 通道则原样返回，色序由分割侧 swapBr 检测 */
    async ensureBgr3(src) {
        if (src.channels === 3) {
            return src;
        }
        const dst = cv.createMat(src.cols, src.rows, 3);
        const code = src.channels === 4
            ? ColorConversionCodes.COLOR_BGRA2BGR
            : ColorConversionCodes.COLOR_GRAY2BGR;
        OpenCV.invoke('cvtColor', src.mat, dst.mat, code);
        return dst;
    },
    /** JS 二值缓冲（0/255）→ 单通道 Mat */
    binaryBufferToMat(buffer, cols, rows) {
        const mat = OpenCV.bufferToMat('uint8', rows, cols, 1, buffer);
        return new WrappedMat(mat, cols, rows, 1);
    },
    /** 连续 BGR 缓冲 → 三通道 Mat */
    bgrBufferToMat(buffer, cols, rows) {
        const mat = OpenCV.bufferToMat('uint8', rows, cols, 3, buffer);
        return new WrappedMat(mat, cols, rows, 3);
    },
    /** 将 JS 侧生成的灰度二值图写入临时 PGM 并读回 Mat */
    async grayBufferToMat(gray, cols, rows) {
        const path = `${RNFS.CachesDirectoryPath}/seg_bin_${Date.now()}.pgm`;
        const header = `P5\n${cols} ${rows}\n255\n`;
        const headerBytes = new TextEncoder().encode(header);
        const fileBytes = new Uint8Array(headerBytes.length + gray.length);
        fileBytes.set(headerBytes, 0);
        fileBytes.set(gray, headerBytes.length);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < fileBytes.length; i += chunkSize) {
            const slice = fileBytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...slice);
        }
        await RNFS.writeFile(path, btoa(binary), 'base64');
        try {
            return readImageFromPath(path, true);
        }
        finally {
            if (await RNFS.exists(path)) {
                await RNFS.unlink(path);
            }
        }
    },
    /**
     * 导出 Mat 像素。先 clone 保证内存连续，避免原生 matToBuffer 忽略 step 导致行错位。
     */
    matToBuffer(src) {
        const continuous = OpenCV.invoke('clone', src.mat);
        try {
            const { buffer, cols, rows, channels } = OpenCV.matToBuffer(continuous, 'uint8');
            return { buffer, cols, rows, channels };
        }
        finally {
            OpenCV.releaseBuffers([continuous.id]);
        }
    },
    async inRangeBgr(src, color, tolerance, dst) {
        const lower = createScalar(Math.max(0, color.b - tolerance), Math.max(0, color.g - tolerance), Math.max(0, color.r - tolerance));
        const upper = createScalar(Math.min(255, color.b + tolerance), Math.min(255, color.g + tolerance), Math.min(255, color.r + tolerance));
        OpenCV.invoke('inRange', src.mat, lower, upper, dst.mat);
    },
    async resize(src, dst, size, interpolation = InterpolationFlags.INTER_LINEAR) {
        const dsize = createSize(size.width, size.height);
        OpenCV.invoke('resize', src.mat, dst.mat, dsize, 0, 0, interpolation);
        dst.cols = size.width;
        dst.rows = size.height;
    },
    /** BGR 缓冲原生缩放（掩码用语义色，默认最近邻） */
    async resizeBgrBuffer(buffer, srcCols, srcRows, dstCols, dstRows, interpolation = InterpolationFlags.INTER_NEAREST) {
        if (srcCols === dstCols && srcRows === dstRows) {
            return buffer;
        }
        const srcMat = cv.bgrBufferToMat(buffer, srcCols, srcRows);
        const dstMat = cv.createMat(dstCols, dstRows, 3);
        try {
            await cv.resize(srcMat, dstMat, { width: dstCols, height: dstRows }, interpolation);
            return cv.matToBuffer(dstMat).buffer;
        }
        finally {
            srcMat.release();
            dstMat.release();
        }
    },
    /** BGR Mat → RGBA 连续缓冲（供 Skia 直传） */
    async matToRgbaBuffer(src) {
        const dst = cv.createMat(src.cols, src.rows, 4);
        try {
            OpenCV.invoke('cvtColor', src.mat, dst.mat, ColorConversionCodes.COLOR_BGR2RGBA);
            const { buffer, cols, rows } = cv.matToBuffer(dst);
            return { buffer, cols, rows };
        }
        finally {
            dst.release();
        }
    },
    /** BGR Mat → Skia 图像（跳过低频/高频 PNG 编码） */
    async matToSkiaImage(src) {
        const { buffer, cols, rows } = await cv.matToRgbaBuffer(src);
        return rgbaBufferToSkiaImage(buffer, cols, rows);
    },
    /** 单通道灰度 Mat → Skia RGBA（跳过 BGR 伪彩 + 四通道 matToBuffer） */
    grayMatToSkiaImage(src) {
        const { buffer, cols, rows } = cv.matToBuffer(src);
        const pixelCount = cols * rows;
        const rgba = new Uint8Array(pixelCount * 4);
        for (let i = 0; i < pixelCount; i++) {
            const value = buffer[i];
            const offset = i * 4;
            rgba[offset] = value;
            rgba[offset + 1] = value;
            rgba[offset + 2] = value;
            rgba[offset + 3] = 255;
        }
        return rgbaBufferToSkiaImage(rgba, cols, rows);
    },
    /** 连续 BGR 缓冲 → Skia 图像（工作分辨率原图 / 高低频，复用 OpenCV 解码结果） */
    async bgrBufferToSkiaImage(buffer, cols, rows) {
        const mat = cv.bgrBufferToMat(buffer, cols, rows);
        try {
            return await cv.matToSkiaImage(mat);
        }
        finally {
            mat.release();
        }
    },
    async threshold(src, dst, thresh, maxval, type) {
        OpenCV.invoke('threshold', src.mat, dst.mat, thresh, maxval, type);
    },
    async getStructuringElement(shape, ksize) {
        const size = createSize(ksize.width, ksize.height);
        const kernel = OpenCV.invoke('getStructuringElement', shape, size);
        return new WrappedMat(kernel, ksize.width, ksize.height, 1);
    },
    async morphologyEx(src, dst, op, kernel) {
        OpenCV.invoke('morphologyEx', src.mat, dst.mat, op, kernel.mat);
    },
    async findContours(image, mode, method) {
        const contours = OpenCV.createObject(ObjectType.PointVectorOfVectors);
        OpenCV.invoke('findContours', image.mat, contours, mode, method);
        const data = OpenCV.toJSValue(contours);
        const wrappers = data.array.map((_, index) => {
            const pv = OpenCV.copyObjectFromVector(contours, index);
            return new ContourWrapper(pv);
        });
        OpenCV.releaseBuffers([contours.id]);
        return wrappers;
    },
    async contourArea(contour) {
        const result = OpenCV.invoke('contourArea', contour.pointVector, false);
        return result.value;
    },
    async boundingRect(contour) {
        const rect = OpenCV.invoke('boundingRect', contour.pointVector);
        const js = OpenCV.toJSValue(rect);
        return { x: js.x, y: js.y, width: js.width, height: js.height };
    },
    async arcLength(contour, closed) {
        const result = OpenCV.invoke('arcLength', contour.pointVector, closed);
        return result.value;
    },
    async approxPolyDP(contour, epsilon, closed) {
        const approx = OpenCV.createObject(ObjectType.PointVector);
        try {
            OpenCV.invoke('approxPolyDP', contour.pointVector, approx, epsilon, closed);
            return OpenCV.toJSValue(approx).array;
        }
        finally {
            OpenCV.releaseBuffers([approx.id]);
        }
    },
    async GaussianBlur(src, dst, ksize, sigma) {
        const width = normalizeGaussianKernel(ksize.width);
        const height = normalizeGaussianKernel(ksize.height);
        const size = createSize(width, height);
        OpenCV.invoke('GaussianBlur', src.mat, dst.mat, size, sigma);
    },
    extractChannel(src, dst, channel) {
        OpenCV.invoke('extractChannel', src.mat, dst.mat, channel);
    },
    convertTo(src, dst, rtype, alpha = 1, beta = 0) {
        OpenCV.invoke('convertTo', src.mat, dst.mat, rtype, alpha, beta);
    },
    async subtract(src1, src2, dst) {
        OpenCV.invoke('subtract', src1.mat, src2.mat, dst.mat);
    },
    async addWeighted(src1, alpha, src2, beta, gamma, dst) {
        if (src2) {
            OpenCV.invoke('addWeighted', src1.mat, alpha, src2.mat, beta, gamma, dst.mat);
        }
        else {
            OpenCV.invoke('addWeighted', src1.mat, alpha, src1.mat, 0, gamma, dst.mat);
        }
    },
    async imwrite(path, mat) {
        const filePath = normalizePath(path);
        OpenCV.saveMatToFile(mat.mat, filePath, 'png', PNG_COMPRESSION);
    },
};
export default cv;
//# sourceMappingURL=opencvAdapter.js.map