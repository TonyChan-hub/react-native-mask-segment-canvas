import cv, { type WrappedMat } from './opencvAdapter';
import { rgbaBufferToSkiaImage } from './skiaImage';
import type { SkImage } from '@shopify/react-native-skia';
import { getMaskSegmentRuntimeConfig } from './maskSegmentRuntime';

export type FreqLayerImages = {
  lowFreqImage: SkImage;
  highFreqImage: SkImage;
};

export type PaintResourceBatch = {
  originImage: SkImage;
  layers: FreqLayerImages;
};

/** OpenCV 8-bit Lab L 通道（BGR 输入，供单测与近似对照） */
export function bgrToLabL(b: number, g: number, r: number): number {
  let rf = r / 255;
  let gf = g / 255;
  let bf = b / 255;
  rf = rf > 0.04045 ? Math.pow((rf + 0.055) / 1.055, 2.4) : rf / 12.92;
  gf = gf > 0.04045 ? Math.pow((gf + 0.055) / 1.055, 2.4) : gf / 12.92;
  bf = bf > 0.04045 ? Math.pow((bf + 0.055) / 1.055, 2.4) : bf / 12.92;

  const x = rf * 0.412453 + gf * 0.35758 + bf * 0.180423;
  const y = rf * 0.212671 + gf * 0.71516 + bf * 0.072169;
  const z = rf * 0.019334 + gf * 0.119193 + bf * 0.950227;

  const xn = 0.950456;
  const yn = 1;
  const zn = 1.088754;
  const delta = 6 / 29;
  const delta3 = delta * delta * delta;

  let fx = x / xn;
  let fy = y / yn;
  let fz = z / zn;
  fx = fx > delta3 ? Math.cbrt(fx) : fx / (3 * delta * delta) + 4 / 29;
  fy = fy > delta3 ? Math.cbrt(fy) : fy / (3 * delta * delta) + 4 / 29;
  fz = fz > delta3 ? Math.cbrt(fz) : fz / (3 * delta * delta) + 4 / 29;

  const L = fy * 116 - 16;
  return Math.max(0, Math.min(255, Math.round((L * 255) / 100)));
}

export function bgrBufferToRgbaBuffer(
  bgr: Uint8Array,
  cols: number,
  rows: number,
): Uint8Array {
  const pixelCount = cols * rows;
  const rgba = new Uint8Array(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const s = i * 3;
    const d = i * 4;
    rgba[d] = bgr[s + 2];
    rgba[d + 1] = bgr[s + 1];
    rgba[d + 2] = bgr[s];
    rgba[d + 3] = 255;
  }
  return rgba;
}

export function releaseFreqLayerImages(layers: FreqLayerImages | null) {
  layers?.lowFreqImage.dispose();
  layers?.highFreqImage.dispose();
}

/** 16-bit 有符号差分 → 8-bit 高频层（detail * gain + 128） */
async function buildHighFreqMatNative(
  lMat: WrappedMat,
  lLowMat: WrappedMat,
  cols: number,
  rows: number,
  gain: number,
): Promise<WrappedMat> {
  const l16 = cv.createMat(cols, rows, 1);
  const lLow16 = cv.createMat(cols, rows, 1);
  const diff16 = cv.createMat(cols, rows, 1);
  const high8 = cv.createMat(cols, rows, 1);
  try {
    cv.convertTo(lMat, l16, cv.CV_16SC1);
    cv.convertTo(lLowMat, lLow16, cv.CV_16SC1);
    await cv.subtract(l16, lLow16, diff16);
    await cv.addWeighted(diff16, gain, null, 0, 128, diff16);
    cv.convertTo(diff16, high8, cv.CV_8UC1);
    return high8;
  } finally {
    l16.release();
    lLow16.release();
    diff16.release();
  }
}

async function downscaleMatForFreq(
  workMat: WrappedMat,
  cols: number,
  rows: number,
): Promise<{
  mat: WrappedMat;
  cols: number;
  rows: number;
  owned: boolean;
}> {
  const maxLongSide = getMaskSegmentRuntimeConfig().pipeline.paintFreqMaxLongSide;
  const longSide = Math.max(cols, rows);
  if (longSide <= maxLongSide) {
    return { mat: workMat, cols, rows, owned: false };
  }

  const scale = maxLongSide / longSide;
  const freqCols = Math.floor(cols * scale);
  const freqRows = Math.floor(rows * scale);
  const resized = cv.createMat(freqCols, freqRows, 3);
  await cv.resize(
    workMat,
    resized,
    { width: freqCols, height: freqRows },
    cv.INTER_LINEAR,
  );
  return { mat: resized, cols: freqCols, rows: freqRows, owned: true };
}

/** 复用已上传的 BGR Mat，避免重复 bufferToMat + JS↔原生往返 */
export async function prepareFreqLayersFromWorkMat(
  workMat: WrappedMat,
  cols: number,
  rows: number,
): Promise<FreqLayerImages | null> {
  const paintCfg = getMaskSegmentRuntimeConfig().paint;
  const blurStart = __DEV__ ? performance.now() : 0;
  const scaled = await downscaleMatForFreq(workMat, cols, rows);
  const freqMat = scaled.mat;
  const freqCols = scaled.cols;
  const freqRows = scaled.rows;
  let labMat: WrappedMat | null = null;
  let lMat: WrappedMat | null = null;
  let lLowMat: WrappedMat | null = null;
  let lHighMat: WrappedMat | null = null;

  try {
    labMat = cv.cvtColorBgr(freqMat, cv.COLOR_BGR2Lab);
    lMat = cv.createMat(freqCols, freqRows, 1);
    cv.extractChannel(labMat, lMat, 0);
    labMat.release();
    labMat = null;

    lLowMat = cv.createMat(freqCols, freqRows, 1);
    const kernel = paintCfg.lLowBlurKernel;
    await cv.GaussianBlur(
      lMat,
      lLowMat,
      { width: kernel, height: kernel },
      0,
    );

    lHighMat = await buildHighFreqMatNative(
      lMat,
      lLowMat,
      freqCols,
      freqRows,
      paintCfg.lHighGain,
    );

    await cv.addWeighted(
      lLowMat,
      paintCfg.lLowContrast,
      null,
      0,
      128 * (1 - paintCfg.lLowContrast),
      lLowMat,
    );
    await cv.addWeighted(
      lLowMat,
      paintCfg.lLowBrightness,
      null,
      0,
      128 * (1 - paintCfg.lLowBrightness),
      lLowMat,
    );


    const lowFreqImage = cv.grayMatToSkiaImage(lLowMat);
    const highFreqImage = cv.grayMatToSkiaImage(lHighMat);

    if (!lowFreqImage || !highFreqImage) {
      lowFreqImage?.dispose();
      highFreqImage?.dispose();
      return null;
    }

    return { lowFreqImage, highFreqImage };
  } finally {
    if (scaled.owned) {
      freqMat.release();
    }
    labMat?.release();
    lMat?.release();
    lLowMat?.release();
    lHighMat?.release();
  }
}

/** 单次 Mat 上传 → 高低频 + 原图 Skia（并行，高低频先就绪时可回调） */
export async function preparePaintResourcesFromWorkBuffer(
  bgrBuffer: Uint8Array,
  cols: number,
  rows: number,
  onFreqLayersReady?: (layers: FreqLayerImages) => void,
): Promise<PaintResourceBatch | null> {
  const pixelCount = cols * rows;
  if (bgrBuffer.length !== pixelCount * 3) {
    return null;
  }

  const prepStart = __DEV__ ? performance.now() : 0;
  const workMat = cv.bgrBufferToMat(bgrBuffer, cols, rows);
  try {
    const originPromise = cv.matToSkiaImage(workMat);
    const freqPromise = prepareFreqLayersFromWorkMat(workMat, cols, rows);

    const layers = await freqPromise;
    if (!layers) {
      const originImage = await originPromise;
      originImage?.dispose();
      return null;
    }
    onFreqLayersReady?.(layers);

    const originImage = await originPromise;
    if (!originImage) {
      releaseFreqLayerImages(layers);
      return null;
    }

    return { originImage, layers };
  } finally {
    workMat.release();
  }
}

/** @deprecated 测试兼容；生产路径请用 preparePaintResourcesFromWorkBuffer */
export async function prepareFreqLayersFromBgrBuffer(
  bgrBuffer: Uint8Array,
  cols: number,
  rows: number,
): Promise<FreqLayerImages | null> {
  const pixelCount = cols * rows;
  if (bgrBuffer.length !== pixelCount * 3) {
    return null;
  }
  const workMat = cv.bgrBufferToMat(bgrBuffer, cols, rows);
  try {
    return await prepareFreqLayersFromWorkMat(workMat, cols, rows);
  } finally {
    workMat.release();
  }
}

/** 原图 BGR → Skia RGBA（OpenCV cvtColor，与 freq 并行） */
export async function originBgrBufferToSkiaImage(
  bgrBuffer: Uint8Array,
  cols: number,
  rows: number,
): Promise<SkImage | null> {
  return cv.bgrBufferToSkiaImage(bgrBuffer, cols, rows);
}
