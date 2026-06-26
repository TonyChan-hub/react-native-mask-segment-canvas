import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { ensurePngFile, isPngPath, normalizePath, toPngFileName } from './pngImage';
function hashUrl(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
        hash = (hash * 31 + url.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
}
/** 将本地路径或远程 URL 解析为 OpenCV / RNFS 可读的 PNG 本地路径 */
export async function resolveImageUrl(source, cacheFileName) {
    const trimmed = source.trim();
    if (!trimmed) {
        throw new Error('Image URL is empty');
    }
    const pngCacheName = toPngFileName(cacheFileName ?? `img_${hashUrl(trimmed)}.png`);
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const tmpDest = `${RNFS.CachesDirectoryPath}/tmp_${Date.now()}_${pngCacheName}`;
        const { statusCode } = await RNFS.downloadFile({
            fromUrl: trimmed,
            toFile: tmpDest,
        }).promise;
        if (statusCode !== 200) {
            throw new Error(`Download image failed: ${trimmed}`);
        }
        try {
            return await ensurePngFile(tmpDest, pngCacheName);
        }
        finally {
            if (await RNFS.exists(tmpDest)) {
                await RNFS.unlink(tmpDest);
            }
        }
    }
    const normalized = normalizePath(trimmed);
    if (await RNFS.exists(normalized) && isPngPath(normalized)) {
        return normalized;
    }
    if (normalized.startsWith('file://')) {
        return ensurePngFile(normalized, pngCacheName);
    }
    if (Platform.OS === 'ios' && normalized.startsWith('/')) {
        return ensurePngFile(normalized, pngCacheName);
    }
    if (await RNFS.exists(normalized)) {
        return ensurePngFile(normalized, pngCacheName);
    }
    return ensurePngFile(trimmed, pngCacheName);
}
//# sourceMappingURL=resolveImageUrl.js.map