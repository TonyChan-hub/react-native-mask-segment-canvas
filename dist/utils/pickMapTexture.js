import { Skia, AlphaType, ColorType, } from '@shopify/react-native-skia';
/** pickMap 像素值 regionId+1 → RGBA 纹理（R 通道存查表码） */
export function pickBufferToSkImage(pickBuffer, cols, rows) {
    if (pickBuffer.length !== cols * rows) {
        return null;
    }
    const rgba = new Uint8Array(cols * rows * 4);
    for (let i = 0; i < pickBuffer.length; i++) {
        const o = i * 4;
        const code = pickBuffer[i];
        rgba[o] = code;
        rgba[o + 1] = code;
        rgba[o + 2] = code;
        rgba[o + 3] = 255;
    }
    const data = Skia.Data.fromBytes(rgba);
    return Skia.Image.MakeImage({
        width: cols,
        height: rows,
        alphaType: AlphaType.Opaque,
        colorType: ColorType.RGBA_8888,
    }, data, cols * 4);
}
//# sourceMappingURL=pickMapTexture.js.map