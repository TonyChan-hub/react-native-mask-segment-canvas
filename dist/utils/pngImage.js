import RNFS from 'react-native-fs';
import UPNG from 'upng-js';
import { OpenCV, ObjectType, DataTypes, ColorConversionCodes, } from 'react-native-fast-opencv';
export const PNG_EXT = '.png';
/** PNG 压缩级别 0 = 无损 */
export const PNG_COMPRESSION = 0;
export function normalizePath(path) {
    return path.startsWith('file://') ? path.slice(7) : path;
}
/** Skia useImage 需要 URI；OpenCV / RNFS 使用裸路径 */
export function toSkiaUri(path) {
    if (!path) {
        return null;
    }
    if (path.startsWith('http://') ||
        path.startsWith('https://') ||
        path.startsWith('data:') ||
        path.startsWith('file://')) {
        return path;
    }
    const normalized = normalizePath(path);
    return `file://${normalized}`;
}
export function toPngFileName(name) {
    const base = name.replace(/\.(jpe?g|webp|gif|bmp|heic|heif)$/i, '');
    return base.toLowerCase().endsWith(PNG_EXT) ? base : `${base}${PNG_EXT}`;
}
export function isPngPath(path) {
    return normalizePath(path).toLowerCase().endsWith(PNG_EXT);
}
function hashString(value) {
    let hash = 5381;
    for (let i = 0; i < value.length; i++) {
        hash = Math.imul(hash, 33) ^ value.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}
function hashPath(path) {
    return hashString(path);
}
/** 按文件元数据生成指纹，避免整文件读入（原 base64 全量哈希在 1.5MB 图上极慢） */
export async function fileContentFingerprint(path) {
    const normalized = normalizePath(path);
    const stat = await RNFS.stat(normalized);
    return hashString(`${stat.size}:${stat.mtime ?? stat.ctime}`);
}
function versionedCachePath(cacheFileName, fingerprint) {
    const baseName = toPngFileName(cacheFileName).replace(/\.png$/i, '');
    return `${RNFS.CachesDirectoryPath}/${baseName}_${fingerprint}${PNG_EXT}`;
}
async function cleanupStaleVersionedCache(cacheFileName, keepDest) {
    const baseName = toPngFileName(cacheFileName).replace(/\.png$/i, '');
    const legacyDest = `${RNFS.CachesDirectoryPath}/${toPngFileName(cacheFileName)}`;
    const prefix = `${baseName}_`;
    if (legacyDest !== keepDest && (await RNFS.exists(legacyDest))) {
        await RNFS.unlink(legacyDest);
    }
    const files = await RNFS.readDir(RNFS.CachesDirectoryPath);
    for (const file of files) {
        if (file.isFile() &&
            file.name.startsWith(prefix) &&
            file.name.endsWith(PNG_EXT) &&
            file.path !== keepDest) {
            await RNFS.unlink(file.path);
        }
    }
}
/** 任意图片路径 → 缓存目录下的 PNG 文件路径（已是 PNG 则复制，否则解码转存） */
export async function ensurePngFile(sourcePath, cacheFileName) {
    const src = normalizePath(sourcePath);
    const fingerprint = await fileContentFingerprint(src);
    const dest = versionedCachePath(cacheFileName, fingerprint);
    if (!(await RNFS.exists(src))) {
        throw new Error(`Image does not exist: ${src}`);
    }
    if (src === dest) {
        return dest;
    }
    if (await RNFS.exists(dest)) {
        return dest;
    }
    if (isPngPath(src)) {
        await RNFS.copyFile(src, dest);
        await cleanupStaleVersionedCache(cacheFileName, dest);
        return dest;
    }
    const base64 = await RNFS.readFile(src, 'base64');
    const mat = OpenCV.base64ToMat(base64);
    OpenCV.saveMatToFile(mat, dest, 'png', PNG_COMPRESSION);
    OpenCV.releaseBuffers([mat.id]);
    await cleanupStaleVersionedCache(cacheFileName, dest);
    return dest;
}
/** 根据源路径生成稳定 PNG 缓存名 */
export function pngCacheName(sourcePath, prefix) {
    return `${prefix}_${hashPath(normalizePath(sourcePath))}${PNG_EXT}`;
}
const DERIVED_CACHE_PREFIXES = [
    'seg_lowfreq_',
    'seg_highfreq_',
    'imread_',
    'img_',
    'tmp_',
];
/** 清理分割/OpenCV 派生缓存，保留原图与掩码源文件 */
export async function clearDerivedImageCache() {
    const files = await RNFS.readDir(RNFS.CachesDirectoryPath);
    let removed = 0;
    for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(PNG_EXT)) {
            continue;
        }
        if (!DERIVED_CACHE_PREFIXES.some(prefix => file.name.startsWith(prefix))) {
            continue;
        }
        await RNFS.unlink(file.path);
        removed += 1;
    }
    return removed;
}
const CV_MAT_DEPTH_MASK = 7;
function matDepth(type) {
    return type & CV_MAT_DEPTH_MASK;
}
function matChannelsFromType(type) {
    return (type >> 3) + 1;
}
function pngColorTypeToChannels(colorType) {
    switch (colorType) {
        case 0:
            return 1;
        case 2:
        case 3:
            return 3;
        case 4:
            return 2;
        case 6:
            return 4;
        default:
            return 3;
    }
}
/** 从 base64 解析 PNG IHDR（不依赖 OpenCV），用于 16-bit Mat toJSValue 崩溃时的降级通路 */
export function readPngHeaderFromBase64(base64) {
    // PNG 签名 8 字节 + IHDR 长度 4 + "IHDR" 4 + 宽 4 + 高 4 + 位深 1 + 颜色类型 1 = 26 字节
    // base64 每 3 字节 → 4 字符，取前 40 字符覆盖 ~30 字节
    const headerPart = base64.slice(0, 40);
    const binary = atob(headerPart);
    function readUint32BE(offset) {
        return (((binary.charCodeAt(offset) << 24) |
            (binary.charCodeAt(offset + 1) << 16) |
            (binary.charCodeAt(offset + 2) << 8) |
            binary.charCodeAt(offset + 3)) >>>
            0);
    }
    // 校验 PNG 签名
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) {
        if (binary.charCodeAt(i) !== sig[i]) {
            throw new Error('Invalid PNG file (signature mismatch)');
        }
    }
    const width = readUint32BE(16);
    const height = readUint32BE(20);
    const bitDepth = binary.charCodeAt(24);
    const colorType = binary.charCodeAt(25);
    if (width === 0 || height === 0) {
        throw new Error(`Invalid PNG size: ${width}x${height}`);
    }
    return { width, height, bitDepth, colorType };
}
/** 16-bit / float Mat → 8-bit（fast-opencv 在 patch 前 toJSValue 会截断高位）。
 *  Semantic mask PNGs use 16-bit RGB where the label (0-255) is stored as value×257;
 *  use 1/257 scaling for 3+ channel 16-bit cases so the resulting 8-bit channels contain
 *  the original semantic label values (consistent with the native ensure8U patch).
 *
 *  pngHeader 可选：当 toJSValue 因 16-bit Mat 崩溃时，用 PNG 文件头信息做降级转换，
 *  绕过原生 toJSValue 调用。
 */
export function ensureMat8U(srcMat, pngHeader) {
    let info;
    try {
        info = OpenCV.toJSValue(srcMat);
    }
    catch (toJsError) {
        if (!pngHeader) {
            throw new Error(`OpenCV toJSValue failed (mat id=${srcMat?.id ?? 'unknown'}): ${toJsError.message}`);
        }
        // 降级通路: 16-bit PNG 的 Mat 无法通过 toJSValue 读取元数据，
        // 直接使用 PNG 文件头中的宽高和位深信息做 convertTo
        const { width: cols, height: rows, bitDepth, colorType } = pngHeader;
        const ch = pngColorTypeToChannels(colorType);
        if (bitDepth <= 8) {
            // 8-bit 或更低，不需要 convertTo，直接返回
            return { mat: srcMat, extraReleaseIds: [] };
        }
        const outType = ch === 1
            ? DataTypes.CV_8UC1
            : ch === 4
                ? DataTypes.CV_8UC4
                : DataTypes.CV_8UC3;
        const dstMat = OpenCV.createObject(ObjectType.Mat, rows, cols, outType);
        // 16-bit RGB 语义掩码: 标签值 = 原始值 / 257
        const alpha = ch >= 3 ? 1 / 257 : 255 / 65535;
        OpenCV.invoke('convertTo', srcMat, dstMat, outType, alpha, 0);
        return { mat: dstMat, extraReleaseIds: [dstMat.id] };
    }
    if (matDepth(info.type) === DataTypes.CV_8U) {
        return { mat: srcMat, extraReleaseIds: [] };
    }
    const rows = info.rows;
    const cols = info.cols;
    const ch = matChannelsFromType(info.type);
    const outType = ch === 1
        ? DataTypes.CV_8UC1
        : ch === 4
            ? DataTypes.CV_8UC4
            : ch === 2
                ? DataTypes.CV_8UC2
                : DataTypes.CV_8UC3;
    const dstMat = OpenCV.createObject(ObjectType.Mat, rows, cols, outType);
    const depth = matDepth(info.type);
    let alpha = 1;
    if (depth === DataTypes.CV_16U || depth === DataTypes.CV_16S) {
        // Special case for semantic mask 16-bit "RGB label" encoding (value × 257)
        alpha = ch >= 3 ? 1 / 257 : 255 / 65535;
    }
    else if (depth === DataTypes.CV_32F || depth === DataTypes.CV_64F) {
        alpha = 255;
    }
    OpenCV.invoke('convertTo', srcMat, dstMat, outType, alpha, 0);
    return { mat: dstMat, extraReleaseIds: [dstMat.id] };
}
/**
 * JS fallback PNG decoder (OpenCV base64ToMat may throw HostFunction for 16-bit PNGs).
 * 16-bit RGB semantic masks use value×257 encoding → UPNG.toRGBA8 high byte = original 8-bit label.
 */
function decodePngToBgrJS(base64) {
    const atobFn = globalThis.atob;
    if (!atobFn) {
        throw new Error('JS PNG fallback: atob unavailable');
    }
    const binary = atobFn(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const decoded = UPNG.decode(bytes);
    const rgbaFrames = UPNG.toRGBA8(decoded);
    const rgbaBuf = new Uint8Array(rgbaFrames[0]);
    const w = decoded.width;
    const h = decoded.height;
    const pixelCount = w * h;
    // RGBA → BGR (drop alpha)
    const bgr = new Uint8Array(pixelCount * 3);
    for (let i = 0; i < pixelCount; i++) {
        const si = i * 4;
        const di = i * 3;
        bgr[di] = rgbaBuf[si + 2]; // B ← R
        bgr[di + 1] = rgbaBuf[si + 1]; // G
        bgr[di + 2] = rgbaBuf[si]; // R ← B
    }
    return { buffer: bgr, cols: w, rows: h };
}
/** Only check PNG magic bytes (89 50 4E 47) — agnostic to bit depth.
 *  OpenCV bridge may throw HostFunction for both 8-bit and 16-bit PNGs.
 *  Fall back to UPNG pure-JS decode for any valid PNG (supports all variants). */
function isPngByBase64Magic(base64) {
    if (!base64 || base64.length < 8) {
        return false;
    }
    try {
        const atobFn = globalThis.atob;
        if (!atobFn) {
            return false;
        }
        const binary = atobFn(base64.slice(0, 12)); // 8 bytes → 12 base64 chars
        return (binary.charCodeAt(0) === 0x89 &&
            binary.charCodeAt(1) === 0x50 &&
            binary.charCodeAt(2) === 0x4e &&
            binary.charCodeAt(3) === 0x47);
    }
    catch {
        return false;
    }
}
/** base64 PNG → 连续 BGR 缓冲（OpenCV 原生解码，跳过 JS atob + upng） */
function decodeBase64PngToBgr(base64) {
    let srcMat;
    try {
        srcMat = OpenCV.base64ToMat(base64);
    }
    catch (e) {
        // OpenCV bridge may throw HostFunction for any PNG (8-bit or 16-bit).
        // Fall back to pure JS decode whenever the file header is PNG.
        if (isPngByBase64Magic(base64)) {
            try {
                return decodePngToBgrJS(base64);
            }
            catch (jsError) {
                throw new Error(`JS PNG fallback also failed (base64 length ${base64?.length ?? 0}): ${jsError.message}`);
            }
        }
        throw new Error(`OpenCV base64ToMat failed (base64 length ${base64?.length ?? 0}): ${e.message}`);
    }
    if (!srcMat || typeof srcMat.id !== 'string' || !srcMat.id) {
        throw new Error(`OpenCV base64ToMat returned invalid Mat (base64 length ${base64?.length ?? 0})`);
    }
    const releaseIds = [srcMat.id];
    try {
        // 先解析 PNG 文件头（宽高、位深），供 ensureMat8U 在 16-bit toJSValue 崩溃时降级使用
        let pngHeader;
        try {
            pngHeader = readPngHeaderFromBase64(base64);
        }
        catch {
            // 非 PNG 或解析失败，不传 header，确保 retain 原有行为
        }
        let workMat;
        let extraReleaseIds;
        try {
            const result = ensureMat8U(srcMat, pngHeader);
            workMat = result.mat;
            extraReleaseIds = result.extraReleaseIds;
        }
        catch (e) {
            throw new Error(`ensureMat8U failed: ${e.message}`);
        }
        releaseIds.push(...extraReleaseIds);
        const info = OpenCV.toJSValue(workMat);
        const cols = info.cols;
        const rows = info.rows;
        let bgrMat = workMat;
        if (info.type === DataTypes.CV_8UC4) {
            bgrMat = OpenCV.createObject(ObjectType.Mat, rows, cols, DataTypes.CV_8UC3);
            releaseIds.push(bgrMat.id);
            OpenCV.invoke('cvtColor', workMat, bgrMat, ColorConversionCodes.COLOR_BGRA2BGR);
        }
        else if (info.type === DataTypes.CV_8UC1) {
            bgrMat = OpenCV.createObject(ObjectType.Mat, rows, cols, DataTypes.CV_8UC3);
            releaseIds.push(bgrMat.id);
            OpenCV.invoke('cvtColor', workMat, bgrMat, ColorConversionCodes.COLOR_GRAY2BGR);
        }
        const continuous = OpenCV.invoke('clone', bgrMat);
        releaseIds.push(continuous.id);
        const { buffer, cols: outCols, rows: outRows } = OpenCV.matToBuffer(continuous, 'uint8');
        return {
            buffer: new Uint8Array(buffer),
            cols: outCols,
            rows: outRows,
        };
    }
    finally {
        OpenCV.releaseBuffers(releaseIds);
    }
}
const pngBgrCache = new Map();
const prewarmInFlight = new Map();
export function prewarmPngBgrCache(paths) {
    for (const path of paths) {
        const filePath = normalizePath(path);
        void readPngBgrBuffer(filePath).catch(() => { });
    }
}
export async function prewarmPngBgrCacheAsync(paths) {
    await Promise.all(paths.map(path => readPngBgrBuffer(normalizePath(path))));
}
export async function pngContentCacheKey(path) {
    const stat = await RNFS.stat(normalizePath(path));
    return `${stat.size}:${stat.mtime ?? stat.ctime}`;
}
export async function readPngBgrBuffer(path) {
    const filePath = normalizePath(path);
    const cacheKey = await pngContentCacheKey(filePath);
    const cached = pngBgrCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const inflight = prewarmInFlight.get(cacheKey);
    if (inflight) {
        return inflight;
    }
    const loadPromise = (async () => {
        const exists = await RNFS.exists(filePath);
        if (!exists) {
            throw new Error(`Image file does not exist: ${filePath}`);
        }
        const stat = await RNFS.stat(filePath);
        if (stat.size === 0) {
            throw new Error(`Image file is empty (0 bytes): ${filePath}`);
        }
        const base64 = await RNFS.readFile(filePath, 'base64');
        if (!base64 || base64.length === 0) {
            throw new Error(`Read base64 is empty: ${filePath}`);
        }
        let decoded;
        try {
            decoded = decodeBase64PngToBgr(base64);
        }
        catch (decodeError) {
            throw new Error(`PNG decode failed: ${filePath} (${stat.size} bytes) - ${decodeError.message}`);
        }
        const entry = {
            buffer: decoded.buffer,
            cols: decoded.cols,
            rows: decoded.rows,
        };
        pngBgrCache.set(cacheKey, entry);
        return entry;
    })();
    prewarmInFlight.set(cacheKey, loadPromise);
    try {
        const result = await loadPromise;
        return result;
    }
    finally {
        prewarmInFlight.delete(cacheKey);
    }
}
export function resizeBgrBuffer(buffer, srcCols, srcRows, dstCols, dstRows) {
    if (srcCols === dstCols && srcRows === dstRows) {
        return buffer;
    }
    const out = new Uint8Array(dstCols * dstRows * 3);
    for (let y = 0; y < dstRows; y++) {
        const sy = Math.min(srcRows - 1, Math.floor((y * srcRows) / dstRows));
        for (let x = 0; x < dstCols; x++) {
            const sx = Math.min(srcCols - 1, Math.floor((x * srcCols) / dstCols));
            const si = (sy * srcCols + sx) * 3;
            const di = (y * dstCols + x) * 3;
            out[di] = buffer[si];
            out[di + 1] = buffer[si + 1];
            out[di + 2] = buffer[si + 2];
        }
    }
    return out;
}
//# sourceMappingURL=pngImage.js.map