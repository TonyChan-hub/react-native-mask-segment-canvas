jest.mock('../src/utils/opencvAdapter', () => ({
  __esModule: true,
  default: {},
}));

import {
  resetMaskSegmentRuntimeConfig,
  setMaskSegmentRuntimeConfig,
} from '../src/utils/maskSegmentRuntime';
import type { SegmentMaskResult } from '../src/utils/maskSegmentation';
import {
  buildPickMapAfterWallSplit,
  dilatePickBuffer1px,
  patchPickMapForManualWallSplit,
  splitWallRegionsByTexture,
  absorbSmallWallGapsForLassoPolygons,
  WALL_SUB_LABEL_NONE,
} from '../src/utils/wallTextureSplit';

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
  // Left blue, right warm (obvious chroma difference)
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
      // Same blue wall, from dark shadow on left to bright area on right
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

test('manual wall split pick map keeps ceiling and wall sub-regions paintable', () => {
  const cols = 20;
  const rows = 10;
  const CEILING_IDX = 1;
  const WALL_IDX = 3;
  const pixelCount = cols * rows;
  const labels = new Uint8Array(pixelCount);
  labels.fill(CEILING_IDX);
  for (let y = 5; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      labels[y * cols + x] = WALL_IDX;
    }
  }
  const baseboardBinary = new Uint8Array(pixelCount);
  const wallSubLabels = new Uint8Array(pixelCount);
  wallSubLabels.fill(WALL_SUB_LABEL_NONE);
  for (let y = 5; y < rows; y++) {
    for (let x = 0; x < cols / 2; x++) {
      wallSubLabels[y * cols + x] = 0;
    }
    for (let x = cols / 2; x < cols; x++) {
      wallSubLabels[y * cols + x] = 1;
    }
  }

  const indexToName = [
    'door',
    'ceiling',
    'cabinet',
    'wall',
    'baseboard',
    'windowFrame',
    'garageDoor',
    'roof',
    'eave',
  ];
  const mergedRegions = [
    { id: 0, name: 'ceiling', area: 100 },
    { id: 1, name: 'wall-1', area: 50 },
    { id: 2, name: 'wall-2', area: 50 },
  ];
  const nameToId = new Map(mergedRegions.map(r => [r.name, r.id]));
  const pickRaw = buildPickMapAfterWallSplit(
    labels,
    baseboardBinary,
    WALL_IDX,
    wallSubLabels,
    indexToName,
    nameToId,
    cols,
    rows,
  );
  const pick = dilatePickBuffer1px(pickRaw, cols, rows);

  expect(pickRegionIdAt(pick, cols, 10, 2)).toBe(0);
  expect(pickRegionIdAt(pick, cols, 3, 7)).toBe(1);
  expect(pickRegionIdAt(pick, cols, 15, 7)).toBe(2);
});

test('manual wall split keeps non-wall region IDs stable', () => {
  const cols = 20;
  const rows = 10;
  const CEILING_IDX = 1;
  const WALL_IDX = 3;
  const WINDOW_IDX = 5;
  const pixelCount = cols * rows;
  const labels = new Uint8Array(pixelCount);
  labels.fill(CEILING_IDX);
  for (let y = 5; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      labels[y * cols + x] = WALL_IDX;
    }
  }
  labels[2 * cols + 18] = WINDOW_IDX;

  const nonWallRegions = [
    { id: 0, name: 'ceiling', area: 100 },
    { id: 2, name: 'windowFrame', area: 20 },
  ];
  const maxNonWallId = Math.max(...nonWallRegions.map(r => r.id));
  const wallSubRegions = [
    { id: maxNonWallId + 1, name: 'wall-1', area: 50 },
    { id: maxNonWallId + 2, name: 'wall-2', area: 40 },
  ];
  const mergedRegions = [...nonWallRegions, ...wallSubRegions];

  expect(mergedRegions.find(r => r.name === 'ceiling')?.id).toBe(0);
  expect(mergedRegions.find(r => r.name === 'windowFrame')?.id).toBe(2);
  expect(mergedRegions.find(r => r.name === 'wall-1')?.id).toBe(3);
  expect(mergedRegions.find(r => r.name === 'wall-2')?.id).toBe(4);

  const indexToName = [
    'door',
    'ceiling',
    'cabinet',
    'wall',
    'baseboard',
    'windowFrame',
    'garageDoor',
    'roof',
    'eave',
  ];
  const baseboardBinary = new Uint8Array(pixelCount);
  const wallSubLabels = new Uint8Array(pixelCount);
  wallSubLabels.fill(WALL_SUB_LABEL_NONE);
  for (let y = 5; y < rows; y++) {
    for (let x = 0; x < cols / 2; x++) {
      wallSubLabels[y * cols + x] = 0;
    }
    for (let x = cols / 2; x < cols; x++) {
      wallSubLabels[y * cols + x] = 1;
    }
  }
  const nameToId = new Map(mergedRegions.map(r => [r.name, r.id]));
  const pickRaw = buildPickMapAfterWallSplit(
    labels,
    baseboardBinary,
    WALL_IDX,
    wallSubLabels,
    indexToName,
    nameToId,
    cols,
    rows,
  );
  const pick = dilatePickBuffer1px(pickRaw, cols, rows);
  expect(pickRegionIdAt(pick, cols, 10, 2)).toBe(0);
  expect(pickRegionIdAt(pick, cols, 18, 2)).toBe(2);
});

test('patchPickMapForManualWallSplit preserves non-wall pick codes', () => {
  const cols = 20;
  const rows = 10;
  const CEILING_IDX = 1;
  const WALL_IDX = 3;
  const pixelCount = cols * rows;
  const labels = new Uint8Array(pixelCount);
  labels.fill(CEILING_IDX);
  for (let y = 5; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      labels[y * cols + x] = WALL_IDX;
    }
  }

  const existingPick = new Uint8Array(pixelCount);
  existingPick.fill(0);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < cols; x++) {
      existingPick[y * cols + x] = 1; // ceiling id 0
    }
  }
  for (let y = 5; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      existingPick[y * cols + x] = 2; // old wall id 1
    }
  }

  const wallSubLabels = new Uint8Array(pixelCount);
  wallSubLabels.fill(WALL_SUB_LABEL_NONE);
  for (let y = 5; y < rows; y++) {
    for (let x = 0; x < cols / 2; x++) {
      wallSubLabels[y * cols + x] = 0;
    }
    for (let x = cols / 2; x < cols; x++) {
      wallSubLabels[y * cols + x] = 1;
    }
  }

  const baseboardBinary = new Uint8Array(pixelCount);
  const nameToId = new Map([
    ['ceiling', 0],
    ['wall-1', 3],
    ['wall-2', 4],
  ]);

  const patched = patchPickMapForManualWallSplit(
    existingPick,
    labels,
    baseboardBinary,
    WALL_IDX,
    wallSubLabels,
    nameToId,
    cols,
    rows,
  );

  expect(pickRegionIdAt(patched, cols, 10, 2)).toBe(0);
  expect(pickRegionIdAt(patched, cols, 3, 7)).toBe(3);
  expect(pickRegionIdAt(patched, cols, 15, 7)).toBe(4);
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

test('absorbSmallWallGapsForLassoPolygons merges thin unassigned wall slivers', () => {
  const cols = 20;
  const rows = 1;
  const pixelCount = cols * rows;
  const labels = new Uint8Array(pixelCount);
  labels.fill(WALL_IDX);
  const baseboardBinary = new Uint8Array(pixelCount);
  const priorAssigned = new Uint8Array(pixelCount);
  priorAssigned.fill(WALL_SUB_LABEL_NONE);

  const polyLabels = new Uint8Array(pixelCount);
  polyLabels.fill(WALL_SUB_LABEL_NONE);
  for (let x = 0; x <= 14; x++) {
    polyLabels[x] = 0;
  }

  const areas = [15];
  const bboxes = [{ x: 0, y: 0, w: 15, h: 1 }];

  absorbSmallWallGapsForLassoPolygons(
    polyLabels,
    1,
    areas,
    bboxes,
    labels,
    baseboardBinary,
    WALL_IDX,
    priorAssigned,
    cols,
    rows,
    3,
  );

  expect(polyLabels[15]).toBe(0);
  expect(polyLabels[16]).toBe(0);
  expect(polyLabels[17]).toBe(0);
  expect(areas[0]).toBe(18);
});

test('absorbSmallWallGapsForLassoPolygons respects dilation radius limit', () => {
  const cols = 20;
  const rows = 1;
  const pixelCount = cols * rows;
  const labels = new Uint8Array(pixelCount);
  labels.fill(WALL_IDX);
  const baseboardBinary = new Uint8Array(pixelCount);
  const priorAssigned = new Uint8Array(pixelCount);
  priorAssigned.fill(WALL_SUB_LABEL_NONE);

  const polyLabels = new Uint8Array(pixelCount);
  polyLabels.fill(WALL_SUB_LABEL_NONE);
  for (let x = 0; x <= 10; x++) {
    polyLabels[x] = 0;
  }

  const areas = [11];
  const bboxes = [{ x: 0, y: 0, w: 11, h: 1 }];

  absorbSmallWallGapsForLassoPolygons(
    polyLabels,
    1,
    areas,
    bboxes,
    labels,
    baseboardBinary,
    WALL_IDX,
    priorAssigned,
    cols,
    rows,
    3,
  );

  expect(polyLabels[11]).toBe(0);
  expect(polyLabels[12]).toBe(0);
  expect(polyLabels[13]).toBe(0);
  expect(polyLabels[14]).toBe(WALL_SUB_LABEL_NONE);
  expect(areas[0]).toBe(14);
});
