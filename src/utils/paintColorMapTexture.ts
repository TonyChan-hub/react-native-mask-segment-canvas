import {
  Skia,
  AlphaType,
  ColorType,
  type SkImage,
} from '@shopify/react-native-skia';
import type { BgrColor } from '../components/MaskSegmentCanvas.types';

/**
 * Separable box blur on premultiplied RGBA (4-channel 0-255).
 * Feather radius in pixels (at the working pick buffer resolution).
 * Works on premultiplied values so that color naturally diffuses alongside alpha
 * into the feather region — preventing "scatter dots" at resolution-mismatched boundaries.
 */
function boxBlurRgbaPremul(
  rgba: Uint8Array,
  cols: number,
  rows: number,
  radius: number,
): Uint8Array {
  const r = Math.max(1, Math.min(16, Math.round(radius)));
  const tmp = new Uint8Array(cols * rows * 4);
  const dst = new Uint8Array(cols * rows * 4);
  // Horizontal pass
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
      let cnt = 0;
      const base = y * cols * 4;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < cols) {
          const idx = base + xx * 4;
          sumR += rgba[idx];
          sumG += rgba[idx + 1];
          sumB += rgba[idx + 2];
          sumA += rgba[idx + 3];
          cnt++;
        }
      }
      const o = base + x * 4;
      tmp[o] = Math.round(sumR / cnt);
      tmp[o + 1] = Math.round(sumG / cnt);
      tmp[o + 2] = Math.round(sumB / cnt);
      tmp[o + 3] = Math.round(sumA / cnt);
    }
  }
  // Vertical pass
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
      let cnt = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < rows) {
          const idx = yy * cols * 4 + x * 4;
          sumR += tmp[idx];
          sumG += tmp[idx + 1];
          sumB += tmp[idx + 2];
          sumA += tmp[idx + 3];
          cnt++;
        }
      }
      const o = y * cols * 4 + x * 4;
      dst[o] = Math.round(sumR / cnt);
      dst[o + 1] = Math.round(sumG / cnt);
      dst[o + 2] = Math.round(sumB / cnt);
      dst[o + 3] = Math.round(sumA / cnt);
    }
  }
  return dst;
}

/**
 * Separable dilation (max filter) on premultiplied RGBA.
 * Fills small holes (alpha=0) inside painted regions by taking the
 * per-channel maximum in the neighborhood. Applied after boxBlur to
 * eliminate scatter dots caused by segmentation gaps in the pick buffer.
 */
function dilateRgbaPremul(
  rgba: Uint8Array,
  cols: number,
  rows: number,
  radius: number,
): Uint8Array {
  const r = Math.max(1, Math.min(8, Math.round(radius)));
  const tmp = new Uint8Array(cols * rows * 4);
  const dst = new Uint8Array(cols * rows * 4);
  // Horizontal pass
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let maxR = 0, maxG = 0, maxB = 0, maxA = 0;
      const base = y * cols * 4;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < cols) {
          const idx = base + xx * 4;
          if (rgba[idx + 3] > maxA) {
            maxR = rgba[idx];
            maxG = rgba[idx + 1];
            maxB = rgba[idx + 2];
            maxA = rgba[idx + 3];
          } else if (rgba[idx + 3] === maxA && maxA > 0) {
            maxR = Math.max(maxR, rgba[idx]);
            maxG = Math.max(maxG, rgba[idx + 1]);
            maxB = Math.max(maxB, rgba[idx + 2]);
          }
        }
      }
      const o = base + x * 4;
      tmp[o] = maxR;
      tmp[o + 1] = maxG;
      tmp[o + 2] = maxB;
      tmp[o + 3] = maxA;
    }
  }
  // Vertical pass
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      let maxR = 0, maxG = 0, maxB = 0, maxA = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < rows) {
          const idx = yy * cols * 4 + x * 4;
          if (tmp[idx + 3] > maxA) {
            maxR = tmp[idx];
            maxG = tmp[idx + 1];
            maxB = tmp[idx + 2];
            maxA = tmp[idx + 3];
          } else if (tmp[idx + 3] === maxA && maxA > 0) {
            maxR = Math.max(maxR, tmp[idx]);
            maxG = Math.max(maxG, tmp[idx + 1]);
            maxB = Math.max(maxB, tmp[idx + 2]);
          }
        }
      }
      const o = y * cols * 4 + x * 4;
      dst[o] = maxR;
      dst[o + 1] = maxG;
      dst[o + 2] = maxB;
      dst[o + 3] = maxA;
    }
  }
  return dst;
}

/** 按 pickMap 展开的上色颜色图（与 pick 同尺寸，未上色像素 a=0）。支持 maskFeather 产生软边缘 alpha。 */
export function buildPaintColorMapImage(
  pickBuffer: Uint8Array,
  cols: number,
  rows: number,
  paintedRegions: Map<number, BgrColor>,
  featherRadius = 0,
): SkImage {
  const pixelCount = cols * rows;
  const colorByPickCode = new Map<number, BgrColor>();
  for (const [regionId, color] of paintedRegions) {
    colorByPickCode.set(regionId + 1, color);
  }

  // ── Perf fast-path: no feather → 1-pass direct unpremul RGBA (O(N)) ──
  // Skips premul buffer, boxBlur H+V, dilate H+V, and unpremul conversion.
  // The GPU shader handles boundary noise via unpremultiply (rgb /= a) +
  // smoothstep gate, so no CPU-side dilate/filter is needed.
  if (featherRadius <= 0.1 && featherRadius >= -0.1) {
    const rgba = new Uint8Array(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const code = pickBuffer[i];
      const color = code > 0 ? colorByPickCode.get(code) : undefined;
      const o = i * 4;
      if (color) {
        rgba[o] = color.r;
        rgba[o + 1] = color.g;
        rgba[o + 2] = color.b;
        rgba[o + 3] = 255;
      }
    }
    const data = Skia.Data.fromBytes(rgba);
    return Skia.Image.MakeImage(
      { width: cols, height: rows, alphaType: AlphaType.Unpremul, colorType: ColorType.RGBA_8888 },
      data,
      cols * 4,
    )!;
  }

  // ── Feathered path: premul + boxBlur + dilate + unpremul ──
  // Build hard premultiplied RGBA: where a pick code maps to a painted color,
  // store (R, G, B, 255) in premul space. Unpainted pixels stay (0,0,0,0).
  const hardPremul = new Uint8Array(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const code = pickBuffer[i];
    const color = code > 0 ? colorByPickCode.get(code) : undefined;
    const o = i * 4;
    if (color) {
      hardPremul[o] = color.r;
      hardPremul[o + 1] = color.g;
      hardPremul[o + 2] = color.b;
      hardPremul[o + 3] = 255;
    }
  }

  // Box-blur premultiplied RGBA so color naturally diffuses alongside alpha
  // into the feather region. This prevents scatter dots from bilinear
  // interpolation at resolution-mismatched boundaries (where unpainted=black
  // would otherwise leak into boundary samples).
  const blurredPremul = boxBlurRgbaPremul(hardPremul, cols, rows, featherRadius);

  // Dilation pass: fill small holes (alpha=0) inside painted regions that
  // survive the box blur due to segmentation gaps in the pick buffer.
  const filledPremul = dilateRgbaPremul(blurredPremul, cols, rows, featherRadius);

  // Unpremultiply and store as RGBA for the final SkImage.
  const rgba = new Uint8Array(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const a = filledPremul[o + 3];
    if (a > 0) {
      rgba[o] = Math.min(255, Math.round((filledPremul[o] * 255) / a));
      rgba[o + 1] = Math.min(255, Math.round((filledPremul[o + 1] * 255) / a));
      rgba[o + 2] = Math.min(255, Math.round((filledPremul[o + 2] * 255) / a));
      rgba[o + 3] = a;
    }
  }

  const data = Skia.Data.fromBytes(rgba);
  return Skia.Image.MakeImage(
    {
      width: cols,
      height: rows,
      // Unpremul: rgb stores the target paint color (unmodulated), alpha stores coverage (soft edge feather).
      // This ensures ImageShader sampling returns the intended paint color + separate coverage alpha,
      // without premultiplication assumptions that could cause dark fringes on soft edges.
      alphaType: AlphaType.Unpremul,
      colorType: ColorType.RGBA_8888,
    },
    data,
    cols * 4,
  )!;
}
