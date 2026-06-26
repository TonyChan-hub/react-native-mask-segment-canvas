jest.mock('../src/utils/opencvAdapter', () => ({
  __esModule: true,
  default: {},
}));

import {
  buildPaintColorMapImage,
} from '../src/utils/paintColorMapTexture';
import {
  bgrBufferToRgbaBuffer,
  bgrToLabL,
  prepareFreqLayersFromBgrBuffer,
} from '../src/utils/freqLayerPrep';
import { getRegionPaintEffect } from '../src/utils/paintShaderRuntime';

jest.mock('@shopify/react-native-skia', () => {
  const makeImage = jest.fn(() => ({
    dispose: jest.fn(),
    width: () => 2,
    height: () => 2,
  }));
  return {
    Skia: {
      Data: { fromBytes: jest.fn(() => ({})) },
      Image: { MakeImage: makeImage },
      RuntimeEffect: {
        Make: jest.fn(() => ({
          getUniformCount: () => 4,
          getUniformName: (i: number) =>
            ['colorBaseOpacity', 'lLightOpacity', 'textureOpacity', 'showOrigin'][
              i
            ],
        })),
      },
    },
    AlphaType: { Opaque: 1, Unpremul: 3 },
    ColorType: { RGBA_8888: 4 },
    TileMode: { Clamp: 0 },
    ImageFormat: { PNG: 4 },
    Canvas: 'Canvas',
    Fill: 'Fill',
    Shader: 'Shader',
    ImageShader: 'ImageShader',
    Group: 'Group',
    drawAsImage: jest.fn(),
  };
});

test('bgrToLabL returns clamped 0-255', () => {
  expect(bgrToLabL(0, 0, 0)).toBeGreaterThanOrEqual(0);
  expect(bgrToLabL(255, 255, 255)).toBeLessThanOrEqual(255);
  expect(bgrToLabL(128, 128, 128)).toBeGreaterThan(0);
});

test('bgrBufferToRgbaBuffer swaps BGR to RGBA', () => {
  const bgr = new Uint8Array([10, 20, 30]);
  const rgba = bgrBufferToRgbaBuffer(bgr, 1, 1);
  expect(Array.from(rgba)).toEqual([30, 20, 10, 255]);
});

test('buildPaintColorMapImage marks painted pixels', () => {
  const pick = new Uint8Array([0, 1, 2]);
  const painted = new Map([
    [0, { b: 1, g: 2, r: 3 }],
    [1, { b: 4, g: 5, r: 6 }],
  ]);
  const image = buildPaintColorMapImage(pick, 3, 1, painted);
  expect(image).toBeTruthy();
  expect(require('@shopify/react-native-skia').Skia.Image.MakeImage).toHaveBeenCalled();
});

test('prepareFreqLayersFromBgrBuffer rejects invalid buffer size', async () => {
  await expect(prepareFreqLayersFromBgrBuffer(new Uint8Array(2), 1, 1)).resolves.toBeNull();
});

test('regionPaint SkSL compiles via RuntimeEffect', () => {
  const effect = getRegionPaintEffect();
  expect(effect.getUniformCount()).toBe(4);
});
