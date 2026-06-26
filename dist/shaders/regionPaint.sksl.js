/** SkSL：分区上色（保留原图明暗与纹理，按 paintColorMap 叠色） */
export const REGION_PAINT_SKSL = `
uniform shader originTex;
uniform shader paintColorTex;
uniform shader lowFreqTex;
uniform shader highFreqTex;

uniform float colorBaseOpacity;
uniform float lLightOpacity;
uniform float textureOpacity;
uniform float showOrigin;

float luminance(half3 c) {
  return dot(c, half3(0.2126, 0.7152, 0.0722));
}

half3 setLuminance(float lum, half3 base) {
  float diff = lum - luminance(base);
  return base + diff;
}

half3 luminosityBlend(half3 base, half3 blend) {
  return setLuminance(luminance(blend), base);
}

half3 overlayBlend(half3 base, half3 blend) {
  half3 low = 2.0 * base * blend;
  half3 high = 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
  return mix(low, high, step(half3(0.5), base));
}

half4 main(float2 coord) {
  half4 origin = originTex.eval(coord);
  if (showOrigin > 0.5) {
    return origin;
  }

  half4 paintEntry = paintColorTex.eval(coord);
  // The paintColorMap uses Unpremul alpha: painted pixels → (R,G,B,255),
  // transparent pixels → (0,0,0,0). GPU bilinear sampling interpolates
  // straight-alpha values, so at boundaries rgb = trueColor * sampled.a
  // (contaminated with black from the transparent neighbour).
  //
  // Unpremultiply to recover the true paint color:
  //   trueColor = sampled.rgb / sampled.a
  // This eliminates dark fringing at region boundaries.
  float pa = paintEntry.a + 0.0001;
  paintEntry.rgb /= pa;

  // Gate sub-pixel alpha to kill residual sampling noise.
  // Thresholds are deliberately low (≈1.3–3.8 in byte space) because
  // post-unpremul the RGB is correct at any alpha ≥ 0 — we only need
  // to suppress samples that contribute negligibly to the final blend.
  // Using *= preserves the smooth edge; higher-alpha samples pass through.
  paintEntry.a *= smoothstep(0.005, 0.015, paintEntry.a);

  half3 paintRgb = paintEntry.rgb;
  half lowL = lowFreqTex.eval(coord).r;
  half highL = highFreqTex.eval(coord).r;

  half3 base = paintRgb * colorBaseOpacity;
  half3 lit = luminosityBlend(base, half3(lowL));
  half3 withLight = mix(base, lit, lLightOpacity);
  half3 tex = overlayBlend(withLight, half3(highL));
  half3 finalRgb = mix(withLight, tex, textureOpacity);

  // Soft edge blend using the (feathered) alpha from the paint color map as coverage.
  half3 blended = mix(origin.rgb, finalRgb, paintEntry.a);
  return half4(blended, 1.0);
}
`;
//# sourceMappingURL=regionPaint.sksl.js.map