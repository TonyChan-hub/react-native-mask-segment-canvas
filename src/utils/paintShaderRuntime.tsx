import React from 'react';
import {
  Skia,
  Shader,
  ImageShader,
  Group,
  Rect,
  drawAsImage,
  type SkImage,
  type SkRuntimeEffect,
} from '@shopify/react-native-skia';
import { REGION_PAINT_SKSL } from '../shaders/regionPaint.sksl';
import type { BgrColor } from '../components/MaskSegmentCanvas.types';
import { getMaskSegmentRuntimeConfig } from './maskSegmentRuntime';
import { buildPaintColorMapImage } from './paintColorMapTexture';

let cachedEffect: SkRuntimeEffect | null = null;

export function getRegionPaintEffect(): SkRuntimeEffect {
  if (cachedEffect) {
    return cachedEffect;
  }
  const effect = Skia.RuntimeEffect.Make(REGION_PAINT_SKSL);
  if (!effect) {
    throw new Error('regionPaint SkSL compile failed');
  }
  cachedEffect = effect;
  return effect;
}

export type PaintShaderTextures = {
  originImage: SkImage;
  paintColorMap: SkImage;
  lowFreqImage: SkImage;
  highFreqImage: SkImage;
};

export function buildPaintShaderUniforms(showOrigin: boolean) {
  const paintCfg = getMaskSegmentRuntimeConfig().paint;
  return {
    colorBaseOpacity: paintCfg.colorBaseOpacity,
    lLightOpacity: paintCfg.lLightOpacity,
    textureOpacity: paintCfg.textureOpacity,
    showOrigin: showOrigin ? 1 : 0,
  };
}

export type PaintShaderLayerProps = PaintShaderTextures & {
  x: number;
  y: number;
  width: number;
  height: number;
  showOrigin?: boolean;
};

function createPaintShaderTree(props: PaintShaderLayerProps) {
  const {
    originImage,
    paintColorMap,
    lowFreqImage,
    highFreqImage,
    x,
    y,
    width,
    height,
    showOrigin = false,
  } = props;
  const effect = getRegionPaintEffect();
  const uniforms = buildPaintShaderUniforms(showOrigin);
  const imageShaderProps = {
    fit: 'fill' as const,
    tx: 'clamp' as const,
    ty: 'clamp' as const,
    rect: { x, y, width, height },
  };

  return (
    <Rect x={x} y={y} width={width} height={height}>
      <Shader source={effect} uniforms={uniforms}>
        <ImageShader image={originImage} {...imageShaderProps} />
        <ImageShader image={paintColorMap} {...imageShaderProps} />
        <ImageShader image={lowFreqImage} {...imageShaderProps} />
        <ImageShader image={highFreqImage} {...imageShaderProps} />
      </Shader>
    </Rect>
  );
}

/** Canvas 内全屏上色 Shader 层 */
export function PaintShaderLayer(props: PaintShaderLayerProps) {
  return createPaintShaderTree(props);
}

export function createPaintColorMapForPaint(
  pickBuffer: Uint8Array,
  cols: number,
  rows: number,
  paintedRegions: Map<number, BgrColor>,
): SkImage {
  const paintCfg = getMaskSegmentRuntimeConfig().paint;
  // Prefer color feather for the recolor application alpha (controls soft edge blend for both base color and texture overlay).
  // texture feather kept in config for future differentiation (e.g. high-freq strength roll-off).
  const feather = paintCfg.maskFeatherColor ?? 0;
  return buildPaintColorMapImage(pickBuffer, cols, rows, paintedRegions, feather);
}

export type OffscreenPaintInput = PaintShaderTextures & {
  width: number;
  height: number;
  showOrigin?: boolean;
};

/** 离屏渲染与预览同源的 shader 合成图 */
export async function renderPaintedImageOffscreen(
  input: OffscreenPaintInput,
): Promise<SkImage | null> {
  const { width, height, showOrigin = false, ...textures } = input;
  if (!textures.originImage || !textures.paintColorMap || !textures.lowFreqImage || !textures.highFreqImage) {
    console.warn('[VIZ-SAVE] renderPaintedImageOffscreen: missing one or more shader textures, will fallback');
    return null;
  }
  // drawAsImage expects the *scene content*, not a <Canvas> host component.
  // Passing a <Canvas> could cause the internal player to construct paints with
  // undefined values (leading to k.charAt errors in color/enum code).
  const element = (
    <Group>
      {createPaintShaderTree({
        ...textures,
        x: 0,
        y: 0,
        width,
        height,
        showOrigin,
      })}
    </Group>
  );
  return drawAsImage(element, { width, height });
}

export function releasePaintShaderTextures(textures: {
  originImage?: SkImage | null;
  paintColorMap?: SkImage | null;
  lowFreqImage?: SkImage | null;
  highFreqImage?: SkImage | null;
}) {
  textures.originImage?.dispose();
  textures.paintColorMap?.dispose();
  textures.lowFreqImage?.dispose();
  textures.highFreqImage?.dispose();
}
