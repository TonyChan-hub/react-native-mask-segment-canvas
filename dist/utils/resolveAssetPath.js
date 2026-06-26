import { Image, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { ensurePngFile, toPngFileName } from './pngImage';
/** 将 require() 资源解析为 PNG 本地路径（OpenCV / RNFS 可读） */
export async function resolveAssetPath(assetModule, cacheFileName) {
    const pngCacheName = toPngFileName(cacheFileName);
    const source = Image.resolveAssetSource(assetModule);
    if (!source?.uri) {
        throw new Error('Cannot resolve image resource');
    }
    const { uri } = source;
    if (uri.startsWith('file://')) {
        return ensurePngFile(uri, pngCacheName);
    }
    if (Platform.OS === 'ios' && uri.startsWith('/')) {
        return ensurePngFile(uri, pngCacheName);
    }
    if (Platform.OS === 'ios' && uri.startsWith('/')) {
        return ensurePngFile(uri, pngCacheName);
    }
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
        const tmpDest = `${RNFS.CachesDirectoryPath}/tmp_${Date.now()}_${pngCacheName}`;
        const { statusCode } = await RNFS.downloadFile({
            fromUrl: uri,
            toFile: tmpDest,
        }).promise;
        if (statusCode !== 200) {
            throw new Error(`Download resource failed: ${pngCacheName}`);
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
    if (Platform.OS === 'android') {
        const assetPath = uri
            .replace('asset:/', '')
            .replace('file:///android_asset/', '');
        const tmpDest = `${RNFS.CachesDirectoryPath}/tmp_${Date.now()}_${pngCacheName}`;
        await RNFS.copyFileAssets(assetPath, tmpDest);
        try {
            return await ensurePngFile(tmpDest, pngCacheName);
        }
        finally {
            if (await RNFS.exists(tmpDest)) {
                await RNFS.unlink(tmpDest);
            }
        }
    }
    return ensurePngFile(uri, pngCacheName);
}
//# sourceMappingURL=resolveAssetPath.js.map