jest.mock('../src/utils/opencvAdapter', () => ({
  __esModule: true,
  default: {},
}));

import {
  resetMaskSegmentRuntimeConfig,
  setMaskSegmentRuntimeConfig,
} from '../src/utils/maskSegmentRuntime';
import type { SegmentMaskResult } from '../src/utils/maskSegmentation';
import { splitWallRegionsByTexture } from '../src/utils/wallTextureSplit';

const WALL_IDX = 3;
const IGNORE = 255;

function buildSyntheticWallResult(
  cols: number,
  rows: number,
): SegmentMaskResult {
  const pixelCount = cols * rows;
  const labels = new Uint8Array(pixelCount);
  labels.fill(WALL_IDX);
  const baseboardBinary = new Uint8Array(pixelCount);
  const pick = new Uint8Array(pixelCount);
  pick.fill(1);

  return {
    regions: [
      {
        id: 0,
        name: 'wall',
        hex: '#4363D8',
        color: { b: 216, g: 99, r: 67 },
        polygons: [
          [
            { x: 0, y: 0 },
            { x: cols, y: 0 },
            { x: cols, y: rows },
            { x: 0, y: rows },
          ],
        ],
        bbox: { x: 0, y: 0, w: cols, h: rows },
        area: pixelCount,
      },
    ],
    pickMap: { buffer: pick, cols, rows },
    labels,
    baseboardBinary,
    segCols: cols,
    segRows: rows,
  };
}

function buildSplitOrigin(
  cols: number,
  rows: number,
  leftBgr: [number, number, number],
  rightBgr: [number, number, number],
): Uint8Array {
  const buffer = new Uint8Array(cols * rows * 3);
  const mid = Math.floor(cols / 2);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const [b, g, r] = x < mid ? leftBgr : rightBgr;
      const i = (y * cols + x) * 3;
      buffer[i] = b;
      buffer[i + 1] = g;
      buffer[i + 2] = r;
    }
  }
  return buffer;
}

function pickRegionIdAt(
  pick: Uint8Array,
  cols: number,
  x: number,
  y: number,
): number | null {
  const code = pick[y * cols + x];
  return code > 0 ? code - 1 : null;
}

beforeEach(() => {
  resetMaskSegmentRuntimeConfig();
});

afterAll(() => {
  resetMaskSegmentRuntimeConfig();
});

test('splitWalls:false leaves regions unchanged', () => {
  const cols = 24;
  const rows = 12;
  const base = buildSyntheticWallResult(cols, rows);
  const origin = buildSplitOrigin(cols, rows, [8, 8, 8], [240, 240, 240]);

  setMaskSegmentRuntimeConfig({ maskConfig: { splitWalls: false } });
  const result = splitWallRegionsByTexture(base, origin, cols, rows, 10);

  expect(result.regions.find(r => r.name === 'wall')).toBeTruthy();
  expect(result.regions.some(r => /^wall-\d+$/.test(r.name))).toBe(false);
});

test('white wall and blue wall split into separate regions', () => {
  const cols = 32;
  const rows = 16;
  const base = buildSyntheticWallResult(cols, rows);
  const origin = buildSplitOrigin(cols, rows, [245, 245, 245], [180, 120, 60]);

  setMaskSegmentRuntimeConfig({
    maskConfig: { splitWalls: true },
  });

  const result = splitWallRegionsByTexture(base, origin, cols, rows, 10);
  const wallSubs = result.regions.filter(r => /^wall-\d+$/.test(r.name));
  expect(wallSubs.length).toBeGreaterThanOrEqual(2);

  const pick = result.pickMap.buffer;
  const leftId = pickRegionIdAt(pick, cols, 4, rows >> 1);
  const rightId = pickRegionIdAt(pick, cols, cols - 4, rows >> 1);
  expect(leftId).not.toBeNull();
  expect(rightId).not.toBeNull();
  expect(leftId).not.toBe(rightId);
});

test('splitWalls:true splits wall into wall-1 and wall-2 by chroma', () => {
  const cols = 24;
  const rows = 12;
  const base = buildSyntheticWallResult(cols, rows);
  // 左蓝右暖色（色度差异明显）
  const origin = buildSplitOrigin(cols, rows, [220, 50, 30], [50, 200, 240]);

  setMaskSegmentRuntimeConfig({
    maskConfig: {
      splitWalls: true,
      splitWallsMinAreaRatio: 0.001,
      splitWallsColorDistSq: 400,
    },
  });

  const result = splitWallRegionsByTexture(base, origin, cols, rows, 10);

  const wallSubs = result.regions.filter(r => /^wall-\d+$/.test(r.name));
  expect(wallSubs.length).toBeGreaterThanOrEqual(2);
  expect(result.regions.some(r => r.name === 'wall')).toBe(false);
  expect(result.wallSubLabels).toBeDefined();

  const pick = result.pickMap.buffer;
  const leftId = pickRegionIdAt(pick, cols, 4, rows >> 1);
  const rightId = pickRegionIdAt(pick, cols, cols - 4, rows >> 1);
  expect(leftId).not.toBeNull();
  expect(rightId).not.toBeNull();
  expect(leftId).not.toBe(rightId);
});

test('same-color wall with lighting gradient stays one region', () => {
  const cols = 32;
  const rows = 16;
  const base = buildSyntheticWallResult(cols, rows);
  const origin = new Uint8Array(cols * rows * 3);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = x / Math.max(1, cols - 1);
      const i = (y * cols + x) * 3;
      // 同一蓝色墙面，从左暗阴影到右亮部
      origin[i] = Math.round(160 + t * 70);
      origin[i + 1] = Math.round(70 + t * 50);
      origin[i + 2] = Math.round(40 + t * 30);
    }
  }

  setMaskSegmentRuntimeConfig({
    maskConfig: { splitWalls: true },
  });

  const result = splitWallRegionsByTexture(base, origin, cols, rows, 10);
  const wallSubs = result.regions.filter(r => /^wall-\d+$/.test(r.name));
  expect(wallSubs).toHaveLength(1);
  expect(wallSubs[0].name).toBe('wall-1');
});

test('single-texture wall becomes wall-1 when splitWalls enabled', () => {
  const cols = 16;
  const rows = 8;
  const base = buildSyntheticWallResult(cols, rows);
  const origin = buildSplitOrigin(cols, rows, [120, 120, 120], [120, 120, 120]);

  setMaskSegmentRuntimeConfig({
    maskConfig: { splitWalls: true },
  });

  const result = splitWallRegionsByTexture(base, origin, cols, rows, 10);

  const wallSubs = result.regions.filter(r => /^wall-\d+$/.test(r.name));
  expect(wallSubs).toHaveLength(1);
  expect(wallSubs[0].name).toBe('wall-1');
});
