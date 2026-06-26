/**
 * @format
 */

import type { MaskSegmentSession } from '../src/components/MaskSegmentCanvas.types';
import { createRuntimeConfig } from '../src/utils/maskSegmentRuntime';

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: object) => s, hairlineWidth: 1 },
  ActivityIndicator: 'ActivityIndicator',
  StatusBar: 'StatusIndicator',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  SafeAreaView: ({ children }: { children: unknown }) => children,
}));

jest.mock('../src/components/MaskSegmentCanvas', () => {
  const React = require('react');
  const { forwardRef } = React;
  return {
    __esModule: true,
    default: forwardRef(() => null),
  };
});

jest.mock('../src/utils/pngImage', () => ({
  prewarmPngBgrCacheAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/utils/resolveAssetPath', () => ({
  resolveAssetPath: jest.fn((_asset: number, name: string) =>
    Promise.resolve(`file:///mock/${name}`),
  ),
}));

test('session round-trip shape', () => {
  const session: MaskSegmentSession = {
    version: 1,
    originUrl: 'file:///mock/origin.png',
    maskUrl: 'file:///mock/mask.png',
    painted: [
      {
        regionId: 0,
        regionName: 'wall',
        color: { b: 100, g: 120, r: 140 },
        configJson: { sku: 'paint-001' },
      },
    ],
    paintHistory: [0],
    currentColor: { b: 100, g: 120, r: 140 },
    currentColorConfigJson: { sku: 'paint-001' },
    savedAt: Date.now(),
  };

  const restored = JSON.parse(JSON.stringify(session)) as MaskSegmentSession;
  expect(restored.version).toBe(1);
  expect(restored.painted).toHaveLength(1);
  expect(restored.painted[0].configJson).toEqual({ sku: 'paint-001' });
});

test('runtime config defaults', () => {
  const runtime = createRuntimeConfig();
  expect(runtime.pipeline.maxImageLongSide).toBe(720);
  expect(runtime.paint.palette).toHaveLength(6);
  expect(runtime.mask.semanticColors.length).toBeGreaterThan(0);
});

test('renders app shell', async () => {
  const React = require('react');
  const ReactTestRenderer = require('react-test-renderer');
  const App = require('../App').default;

  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(React.createElement(App));
    await Promise.resolve();
  });
});
