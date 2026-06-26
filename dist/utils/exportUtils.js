import { Buffer } from 'buffer';
import RNFS from 'react-native-fs';
/** Stable fingerprint for painted region colors — used to reuse cached exports. */
export function paintedRegionsFingerprint(painted) {
    if (painted.size === 0) {
        return '';
    }
    const entries = [...painted.entries()].sort((a, b) => a[0] - b[0]);
    return entries.map(([id, c]) => `${id}:${c.r},${c.g},${c.b}`).join('|');
}
export async function writePngBase64ToFile(filePath, base64) {
    await RNFS.writeFile(filePath, base64, 'base64');
}
export async function writePngBytesToFile(filePath, bytes) {
    await RNFS.writeFile(filePath, Buffer.from(bytes).toString('base64'), 'base64');
}
export function stripFilePrefix(uri) {
    return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}
export async function resolveExportResultForDestDir(cached, destDir) {
    if (!destDir) {
        return cached;
    }
    const src = stripFilePrefix(cached.filePath);
    if (src.startsWith(destDir)) {
        return cached;
    }
    const filePath = `${destDir}/painted_${Date.now()}.png`;
    await RNFS.copyFile(src, filePath);
    return { ...cached, filePath };
}
//# sourceMappingURL=exportUtils.js.map