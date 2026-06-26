import type { BgrColor } from '../components/MaskSegmentCanvas.types';
/** Stable fingerprint for painted region colors — used to reuse cached exports. */
export declare function paintedRegionsFingerprint(painted: Map<number, BgrColor>): string;
export declare function writePngBase64ToFile(filePath: string, base64: string): Promise<void>;
export declare function writePngBytesToFile(filePath: string, bytes: Uint8Array): Promise<void>;
export declare function stripFilePrefix(uri: string): string;
export declare function resolveExportResultForDestDir(cached: {
    filePath: string;
    width: number;
    height: number;
    paintedCount: number;
    previewPath?: string;
}, destDir?: string): Promise<{
    filePath: string;
    width: number;
    height: number;
    paintedCount: number;
    previewPath?: string;
}>;
//# sourceMappingURL=exportUtils.d.ts.map