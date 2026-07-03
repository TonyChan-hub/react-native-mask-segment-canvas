[**🇨🇳 中文**](README.zh-CN.md)

---

# 🎨 react-native-mask-segment-canvas

A React Native **0.79** interactive mask segmentation library. The core export is the `MaskSegmentCanvas` component, consumable via **npm package** or **npm link** from any React Native project.

- 🧠 **OpenCV** (`react-native-fast-opencv`): mask semantic layout, baseboard patching, region extraction
- 🖌️ **Skia RuntimeEffect (SkSL)**: single-pass full-screen shader blending original image + LAB low/high frequency texture color overlays
- ✂️ **Skia Path**: dashed outline highlights for regions
- 👆 **Interaction**: bottom color bar for brush selection (optional initialization) → tap a region to paint; tapping without a brush selected fires `onPaintCallback` with a hint; long-press without a brush previews the region's dashed outline

This repository serves as both the **library source** (`src/index.ts`) and a **self-test demo** (root `App.tsx`).

📌 **For the recommended integration demo, see the `example/` directory** — it uses only the public API, fully simulating how a consumer project would integrate (including `package.json`, Metro configuration, and a complete reference `App.tsx`).

---

## Table of Contents

- [Overview](#overview)
- [Requirements](#requirements)
- [Installation](#installation)
  - [Peer Dependencies](#peer-dependencies)
  - [Postinstall Setup](#postinstall-setup)
  - [iOS / Android Native Dependencies](#ios--android-native-dependencies)
  - [Metro Configuration](#metro-configuration)
  - [Troubleshooting: Duplicate Module Errors](#troubleshooting-duplicate-module-errors)
- [Quick Start (Dev Demo)](#quick-start-dev-demo)
- [Basic Usage](#basic-usage)
  - [Minimal Example](#minimal-example)
  - [State Variables](#state-variables)
  - [Choosing Configuration Values](#choosing-configuration-values)
  - [watchState & UI Guidance](#watchstate--ui-guidance)
- [API Reference](#api-reference)
  - [Imports](#imports)
  - [Props: Image & Initialization](#props-image--initialization)
  - [Props: Semantic Colors & Outline](#props-semantic-colors--outline)
  - [Props: maskConfig](#props-maskconfig)
  - [Props: pipelineConfig](#props-pipelineconfig)
  - [Props: paintConfig](#props-paintconfig)
  - [Props: interactionConfig](#props-interactionconfig)
  - [Props: UI Controls & Styling](#props-ui-controls--styling)
  - [Props: Callbacks](#props-callbacks)
  - [Ref Methods](#ref-methods)
  - [Storage Convention](#storage-convention)
- [Interaction Guide](#interaction-guide)
- [Integration Examples](#integration-examples)
  - [Pre-warm PNG Cache (Recommended)](#pre-warm-png-cache-recommended)
  - [Passing Local Paths from an API](#passing-local-paths-from-an-api)
  - [Draft Recovery](#draft-recovery)
  - [Custom Semantic Color Table](#custom-semantic-color-table)
- [Project Structure](#project-structure)
- [Dependencies](#dependencies)
- [Performance](#performance)
  - [Measured Reference (Dev Env + PNG Pre-warming)](#measured-reference-dev-env-png-pre-warming)
  - [Resolution vs pipelineConfig](#resolution-vs-pipelineconfig)
  - [interactive Estimation (Default Pipeline)](#interactive-estimation-default-pipeline)
  - [Device Tier (1080p, Default Pipeline)](#device-tier-1080p-default-pipeline)
  - [Impact of Raising maxImageLongSide](#impact-of-raising-maximagelongside)
  - [Optimization Tips](#optimization-tips)
- [Notes](#notes)
- [Troubleshooting](#troubleshooting)

---

## 🔭 Overview

`MaskSegmentCanvas` renders an original image with an overlaid semantic mask, allowing users to tap regions and apply colors. The pipeline:

1. 📥 **Load** the origin image and mask image (local `file://` or remote `http(s)://`)
2. 🧩 **Segment** the mask via OpenCV into semantic regions (walls, ceiling, baseboard, etc.)
3. 🎨 **Prepare** LAB frequency-layer textures via SkSL for realistic color blending
4. 📐 **Build** Skia dashed-outline paths for each region
5. 👆 **Interactive** — users select a brush color and tap regions to paint; paint layers preserve the underlying texture
6. 💾 **Save** the composited result as PNG; export a JSON session for draft recovery

The component emits `onWatch` state transitions through the pipeline so the host app can show appropriate loading states.

---

## 📋 Requirements

- 🟢 Node.js >= 18 (recommended 20+)
- 🍎 Xcode 15+ (iOS)
- 🤖 Android Studio + JDK 17 (Android)
- 📦 CocoaPods (iOS)

---

## 📦 Installation

### 📦 Peer Dependencies

Install these in your host project (versions should match your host RN version):

```bash
npm install @shopify/react-native-skia react-native-reanimated react-native-fast-opencv react-native-fs buffer upng-js
# If using showDebugPickers (photo library picker)
npm install react-native-image-picker
```

### 🛠️ Postinstall Setup

This library relies on `patch-package` to patch `react-native-fast-opencv`. Your host `package.json` must include:

```json
{
  "scripts": {
    "postinstall": "patch-package"
  },
  "devDependencies": {
    "patch-package": "^8.0.1"
  }
}
```

After installing this library, patches from `node_modules/react-native-mask-segment-canvas/patches/` are applied automatically during the host's `postinstall`.

### 📱 iOS / Android Native Dependencies

```bash
cd ios && pod install && cd ..
```

Ensure the host project has completed Skia, Reanimated, and OpenCV native setup per each library's documentation.

### 🚇 Metro Configuration

When using `npm link`, a monorepo, or `file:` dependencies, add this library to `watchFolders` and use `extraNodeModules` + `blockList` to prevent duplicate module resolution:

```js
const path = require('path');

module.exports = {
  watchFolders: [path.resolve(__dirname, '../MaskSegmentApp')],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    extraNodeModules: {
      'react-native-reanimated': path.resolve(__dirname, 'node_modules/react-native-reanimated'),
      '@shopify/react-native-skia': path.resolve(__dirname, 'node_modules/@shopify/react-native-skia'),
      'react-native-gesture-handler': path.resolve(__dirname, 'node_modules/react-native-gesture-handler'),
      'react-native-fast-opencv': path.resolve(__dirname, 'node_modules/react-native-fast-opencv'),
      'react-native-safe-area-context': path.resolve(__dirname, 'node_modules/react-native-safe-area-context'),
      'react-native-fs': path.resolve(__dirname, 'node_modules/react-native-fs'),
    },
    blockList: [
      /\/MaskSegmentApp\/node_modules\/@shopify\/react-native-skia\//,
      /\/MaskSegmentApp\/node_modules\/react-native-reanimated\//,
      /\/MaskSegmentApp\/node_modules\/react-native-fast-opencv\//,
      /\/MaskSegmentApp\/node_modules\/react-native-gesture-handler\//,
      /\/MaskSegmentApp\/node_modules\/react-native-safe-area-context\//,
      /\/MaskSegmentApp\/node_modules\/react-native-fs\//,
    ],
  },
};
```

**Strongly recommended** — add this at the very top of the host `index.js` (before any business code):

```js
import '@shopify/react-native-skia';
```

See `example/metro.config.js` and `example/index.js` for the complete configuration with all peer singleton packages.

### ⚠️ Troubleshooting: Duplicate Module Errors

Common symptoms:

- `SkiaPictureView must be a function (received 'undefined')`
- `createAnimatedNode: Animated node[...] already exists`

These are almost always caused by Metro resolving multiple copies of reanimated / skia / gesture-handler / fast-opencv / safe-area packages.

**Best practice:**

1. Copy the `singletonPackages` + `extraNodeModules` + `blockList` pattern from `example/metro.config.js`
2. At the top of your `index.js`, import gesture-handler → reanimated → skia in order
3. Restart Metro with `--reset-cache` and reinstall the app

See `example/README.md` for a detailed checklist and template.

---

## 🚀 Quick Start (Dev Demo)

The root `App.tsx` is a full self-test demo that imports directly from `./src`.

```bash
cd MaskSegmentApp

npm install

cd ios && bundle exec pod install && cd ..

npm start

# In another terminal
npm run ios
# or
npm run android
```

**To see how a consumer project integrates:** go to the `example/` directory and follow its `README.md`. It uses `import from 'react-native-mask-segment-canvas'` with standard `package.json` and Metro config, fully simulating a consumer environment.

---

## 💡 Basic Usage

### 🧑‍💻 Minimal Example

A complete, copy-pasteable example covering **PNG pre-warming**, **state management**, **configuration**, **loading states**, **onWatch**, and **ref operations**.

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import MaskSegmentCanvas, {
  type MaskSegmentCanvasRef,
  type MaskSegmentSession,
  type MaskSegmentWatchState,
  type BgrColor,
  MASK_SEMANTIC_COLORS,
  prewarmPngBgrCacheAsync,
} from 'react-native-mask-segment-canvas';

/** Image paths prepared by the host app (local file:// or http(s)://) */
type ImagePaths = {
  origin: string;
  mask: string;
};

const INTERACTIVE_STATES: MaskSegmentWatchState[] = [
  'interactive',
  'mask_paths_ready',
];

export function PaintScreen() {
  const canvasRef = useRef<MaskSegmentCanvasRef>(null);

  const [imagePaths, setImagePaths] = useState<ImagePaths | null>(null);
  const [pathsError, setPathsError] = useState('');
  const [watchState, setWatchState] = useState<MaskSegmentWatchState | ''>('');
  const [errorMessage, setErrorMessage] = useState('');
  const [sessionDraft] = useState<MaskSegmentSession | null>(null);

  const isInteractive = INTERACTIVE_STATES.includes(
    watchState as MaskSegmentWatchState,
  );
  const isOutlineReady = watchState === 'mask_paths_ready';
  const isCanvasLoading =
    imagePaths != null &&
    watchState !== '' &&
    !INTERACTIVE_STATES.includes(watchState as MaskSegmentWatchState) &&
    watchState !== 'error';

  // Example: download images, then pre-warm PNG decode cache
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const origin = 'file:///path/to/origin.png';
        const mask = 'file:///path/to/mask.png';
        await prewarmPngBgrCacheAsync([origin, mask]);
        if (!cancelled) {
          setImagePaths({ origin, mask });
        }
      } catch (e) {
        if (!cancelled) {
          setPathsError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (!isInteractive) return;
    const result = await canvasRef.current?.save({ destDir: undefined });
    console.log('saved', result?.filePath, result?.paintedCount);
  };

  if (pathsError) {
    return <Text>{pathsError}</Text>;
  }

  if (!imagePaths) {
    return (
      <View>
        <ActivityIndicator />
        <Text>Waiting for origin and mask images...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {isCanvasLoading ? <Text>Loading: {watchState}</Text> : null}
      {watchState === 'interactive' ? (
        <Text>Paintable (outlines loading...)</Text>
      ) : null}
      {isOutlineReady ? <Text>Ready</Text> : null}
      {errorMessage ? <Text>{errorMessage}</Text> : null}

      <MaskSegmentCanvas
        ref={canvasRef}
        style={{ flex: 1 }}
        originUrl={imagePaths.origin}
        maskUrl={imagePaths.mask}
        semanticColors={MASK_SEMANTIC_COLORS}
        regionOutlineColor="rgba(20, 120, 235, 0.58)"
        maskConfig={{ blackThreshold: 30, maxRegionColors: 6 }}
        pipelineConfig={{ maxImageLongSide: 720 }}
        paintConfig={{ colorBaseOpacity: 0.88 }}
        interactionConfig={{
          initRegionFlashMs: 1000,
          enableInitRegionFlash: true,
        }}
        initialSession={sessionDraft ?? undefined}
        showDebugPickers={false}
        showToolbar={false}
        showColorBar
        showStatusRow={false}
        showOverlayButtons
        disabled={!isInteractive}
        onWatch={(state, durationMs, detail) => {
          setWatchState(state);
          console.log('[onWatch]', state, durationMs, detail);
        }}
        onPaintCallback={payload => {
          if (payload.kind === 'brush_required') {
            toast(payload.hint);
            return;
          }
          console.log('painted', payload.regionId, payload.regionName, payload.color, payload.configJson);
        }}
        onError={message => {
          setErrorMessage(message);
          setWatchState('error');
        }}
      />
    </View>
  );
}
```

### 📊 State Variables


| State             | Type                         | Purpose                                                                  |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------ |
| `imagePaths`      | `{ origin, mask } | null`    | Local/remote image paths resolved by the host                            |
| `pathsError`      | `string`                     | Error message when path resolution or PNG pre-warming fails              |
| `watchState`      | `MaskSegmentWatchState | ''` | Initialization stage reported by `onWatch`                               |
| `isInteractive`   | derived                      | `true` when `interactive` or `mask_paths_ready` — operations are allowed |
| `isOutlineReady`  | derived                      | `true` when `mask_paths_ready` — carousel dashed outlines are ready      |
| `isCanvasLoading` | derived                      | Canvas init is blocking (not including PNG path waiting)                 |
| `errorMessage`    | `string`                     | Segmentation/loading failure message written by `onError`                |
| `sessionDraft`    | `MaskSegmentSession | null`  | Draft restored from MMKV or similar storage                              |


### ⚙️ Choosing Configuration Values


| Config                        | Use top-level prop when...                | Use nested Config when...                                               |
| ----------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| Semantic colors               | `semanticColors={...}` for most cases     | `maskConfig.semanticColors` when paired with other mask params          |
| Outline color                 | `regionOutlineColor="..."` for most cases | `paintConfig.regionOverlayFill` when also customizing the brush palette |
| Black threshold, max regions  | —                                         | `maskConfig`                                                            |
| Image processing size         | —                                         | `pipelineConfig`                                                        |
| Flash interval, tap tolerance | —                                         | `interactionConfig`                                                     |


Top-level props and nested Configs **can coexist**; top-level `semanticColors` / `regionOutlineColor` take priority.

### 🔄 watchState & UI Guidance

```ts
// Blocking loading (before regions + paint layers are ready)
const isLoading = ![
  'interactive',
  'mask_paths_ready',
  'error',
  '',
].includes(watchState);

// Allow tapping regions, selecting colors, painting (no need to wait for outline paths)
const canOperate =
  watchState === 'interactive' || watchState === 'mask_paths_ready';

// Carousel dashed outlines are fully ready (optional — can dismiss "outlines preparing" hint)
const isOutlineReady = watchState === 'mask_paths_ready';

// Show error screen
const hasError = watchState === 'error';
```

At `interactive`, `detail.maskPathsReady` is typically `false`; at `mask_paths_ready`, it is `true`. The gap is roughly ~100ms (async Skia path construction) and does not block tap-to-paint.

`originUrl` / `maskUrl` support:

- Local paths: `file:///...` or absolute paths
- Remote URLs: `http(s)://...` (the component handles download and decoding internally)

> Legacy props `originImgPath` / `maskImgPath` are deprecated; use `originUrl` / `maskUrl` instead.

---

## 📖 API Reference

### 📥 Imports

```tsx
import MaskSegmentCanvas, {
  type MaskSegmentCanvasRef,
  type MaskSegmentCanvasProps,
  type MaskSegmentSession,
  type MaskSegmentWatchState,
  type MaskSegmentWatchDetail,
  type BgrColor,
  type MaskSemanticColor,
  type PaintCallbackPayload,
  type PaintedRegionRecord,
  type PipelineConfig,
  type MaskSegmentConfig,
  type PaintConfig,
  type InteractionConfig,
  type SavePaintResult,
  MASK_SEMANTIC_COLORS,
  BASEBOARD_SEMANTIC_NAME,
  prewarmPngBgrCacheAsync,
  DEFAULT_PIPELINE_CONFIG,
  DEFAULT_MASK_CONFIG,
  DEFAULT_PAINT_CONFIG,
  DEFAULT_INTERACTION_CONFIG,
} from 'react-native-mask-segment-canvas';
```


| Category                 | Names                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Component                | `MaskSegmentCanvas` (default)                                                          |
| Ref / Props types        | `MaskSegmentCanvasRef`, `MaskSegmentCanvasProps`                                       |
| Session / callback types | `MaskSegmentSession`, `PaintCallbackPayload`, `PaintedRegionRecord`, `SavePaintResult` |
| Watch types              | `MaskSegmentWatchState`, `MaskSegmentWatchDetail`                                      |
| Config types             | `PipelineConfig`, `MaskSegmentConfig`, `PaintConfig`, `InteractionConfig`              |
| Semantic colors          | `MASK_SEMANTIC_COLORS`, `BASEBOARD_SEMANTIC_NAME`                                      |
| Utilities                | `prewarmPngBgrCacheAsync`                                                              |
| Runtime defaults         | `DEFAULT_*_CONFIG`                                                                     |


### 🖼️ Props: Image & Initialization


| Prop                     | Type                      | Required | Default | Description                                                                                                                                               |
| ------------------------ | ------------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `originUrl`              | `string`                  | yes*     | —       | Origin image URL (`file://`, absolute path, or `http(s)://`)                                                                                              |
| `maskUrl`                | `string`                  | yes*     | —       | Mask image URL (semantic color-block image; recommended same dimensions as origin)                                                                        |
| `originImgPath`          | `string`                  | —        | —       | **Deprecated** — use `originUrl`                                                                                                                          |
| `maskImgPath`            | `string`                  | —        | —       | **Deprecated** — use `maskUrl`                                                                                                                            |
| `initialSession`         | `MaskSegmentSession`      | no       | —       | Draft restored from MMKV etc.; automatically calls `loadSession` after regions are ready                                                                  |
| `initialPaintColor`      | `BgrColor`                | no       | —       | **Optional**. Initial custom brush color `{ b, g, r }`; if omitted, no brush is selected by default; user must select a color or call `ref.setPaintColor` |
| `initialPaintConfigJson` | `Record<string, unknown>` | no       | —       | **Optional**. Accompanying brush config for `initialPaintColor`; passed back via `onPaintCallback` on successful paint                                    |


### 🎨 Props: Semantic Colors & Outline


| Prop                 | Type                  | Default                    | Description                                                                  |
| -------------------- | --------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `semanticColors`     | `MaskSemanticColor[]` | `MASK_SEMANTIC_COLORS`     | Mask semantic recognition colors; equivalent to `maskConfig.semanticColors`  |
| `regionOutlineColor` | `string`              | `rgba(20, 120, 235, 0.58)` | Region dashed highlight color; equivalent to `paintConfig.regionOverlayFill` |


Top-level props take priority over nested `maskConfig` / `paintConfig`.

`MaskSemanticColor` structure:

```ts
{
  name: string;   // Semantic name, e.g. wall / ceiling / baseboard
  hex: string;    // Display hex color
  bgr: { b: number; g: number; r: number }; // Must match mask pixel BGR channels
}
```

Built-in palette: `MASK_SEMANTIC_COLORS` (see `src/utils/maskSemanticPalette.ts`).

### 🧩 Props: maskConfig


| Field                          | Type                  | Default                  | Description                                                             |
| ------------------------------ | --------------------- | ------------------------ | ----------------------------------------------------------------------- |
| `semanticColors`               | `MaskSemanticColor[]` | built-in palette         | Mask semantic colors (overridable by top-level `semanticColors`)        |
| `blackThreshold`               | `number`              | `30`                     | Pixels with max(B,G,R) below this value are treated as black background |
| `maxRegionColors`              | `number`              | `6`                      | Maximum semantic regions retained                                       |
| `quantStep`                    | `number`              | `64`                     | Baseboard quantization step                                             |
| `baseboardMaxColorDist`        | `number`              | `42`                     | Baseboard color distance threshold                                      |
| `baseboardStripQuantKeys`      | `string[]`            | built-in keys            | Baseboard strip quantization keys, format `"b,g,r"`                     |
| `wallQuantKeys`                | `string[]`            | built-in keys            | Wall quantization keys                                                  |
| `cabinetQuantKeys`             | `string[]`            | built-in keys            | Cabinet quantization keys                                               |
| `secondarySemanticNames`       | `string[]`            | `garageDoor, roof, eave` | Secondary semantic names                                                |
| `secondaryMinPixelRatio`       | `number`              | `0.002`                  | Minimum pixel ratio for secondary semantics                             |
| `junctionHRadiusPx`            | `number`              | `24`                     | Baseboard junction horizontal radius                                    |
| `junctionVRadiusPx`            | `number`              | `2`                      | Baseboard junction vertical radius                                      |
| `kickBridgeHalfWPx`            | `number`              | `6`                      | Baseboard horizontal gap bridge half-width                              |
| `baseboardJunctionRowMarginPx` | `number`              | `1`                      | Baseboard junction row margin                                           |
| `baseboardJunctionVReachPx`    | `number`              | `2`                      | Baseboard junction vertical reach                                       |
| `baseboardMinRunPx`            | `number`              | `2`                      | Minimum run length for mask strips                                      |
| `splitWalls`                   | `boolean`             | `false`                  | Split wall mask into `wall-1`, `wall-2`… by texture boundaries          |
| `splitWallsMaxCount`           | `number`              | `8`                      | Max wall sub-region count                                               |
| `splitWallsMinAreaRatio`       | `number`              | `0.002`                  | Minimum area ratio for fragments (relative to total seg pixels)         |
| `splitWallsColorDistSq`        | `number`              | `1400`                   | Connected-component chroma mean distance squared threshold              |
| `splitWallsChromaBlurRadius`   | `number`              | `5`                      | Reserved: chroma smoothing radius                                       |
| `splitWallsNeutralChromaMax`   | `number`              | `14`                     | White/gray wall low-chroma radius; forced boundary from colored walls   |


When `splitWalls` is enabled, the single `wall` region is replaced by multiple `wall-N` sub-regions, each independently paintable and undoable. Old sessions with `regionName: 'wall'` cannot map to new sub-region names and must be repainted.

### 🔬 Props: pipelineConfig


| Field                      | Type     | Default | Description                                                         |
| -------------------------- | -------- | ------- | ------------------------------------------------------------------- |
| `maxImageLongSide`         | `number` | `720`   | Maximum long side for segmentation / pickMap / working area scaling |
| `paintFreqMaxLongSide`     | `number` | `480`   | Maximum long side for OpenCV LAB frequency layers                   |
| `originPreviewMaxLongSide` | `number` | `360`   | Maximum long side for preview (main path uses working resolution)   |
| `maskPathMaxLongSide`      | `number` | `480`   | Maximum long side for outline contour downsampling                  |
| `minContourArea`           | `number` | `100`   | Minimum contour area (scales proportionally with resolution)        |
| `contourApproxEpsilon`     | `number` | `0.003` | Contour polygon approximation coefficient                           |
| `maxRegions`               | `number` | `500`   | Maximum region count during segmentation                            |


### 🖌️ Props: paintConfig


| Field                      | Type         | Default                 | Description                                                              |
| -------------------------- | ------------ | ----------------------- | ------------------------------------------------------------------------ |
| `palette`                  | `BgrColor[]` | 6-color built-in        | Bottom brush color strip                                                 |
| `colorBaseOpacity`         | `number`     | `0.88`                  | Base color opacity                                                       |
| `lLightOpacity`            | `number`     | `0.50`                  | L-channel overlay intensity                                              |
| `textureOpacity`           | `number`     | `0.85`                  | High-frequency texture overlay intensity (stronger texture preservation) |
| `lLowBlurKernel`           | `number`     | `7`                     | Low-frequency Gaussian kernel (odd number)                               |
| `lLowContrast`             | `number`     | `1.15`                  | Low-frequency contrast                                                   |
| `lLowBrightness`           | `number`     | `0.9`                   | Low-frequency brightness                                                 |
| `lHighGain`                | `number`     | `1.22`                  | High-frequency gain                                                      |
| `maskFeatherColor`         | `number`     | `1.6`                   | Paint edge feathering (color) — soft-edge alpha radius, in pixels        |
| `maskFeatherTexture`       | `number`     | `0.9`                   | Paint edge feathering (texture) — reserved/auxiliary                     |
| `regionOverlayFill`        | `string`     | `rgba(20,120,235,0.58)` | Dashed line / highlight fill color                                       |
| `regionOutlineStrokeWidth` | `number`     | `4`                     | Dashed outline stroke width                                              |


### 👆 Props: interactionConfig


| Field                   | Type      | Default | Description                                                     |
| ----------------------- | --------- | ------- | --------------------------------------------------------------- |
| `pickMapSearchRadiusPx` | `number`  | `14`    | Click pickMap search radius (pixels)                            |
| `kickMaskPickRadiusPx`  | `number`  | `36`    | Baseboard mask pick radius                                      |
| `thinStripPadding`      | `number`  | `0.008` | Thin strip (baseboard) tap expansion ratio                      |
| `regionPadding`         | `number`  | `0.003` | Normal region tap expansion ratio                               |
| `initRegionFlashMs`     | `number`  | `1000`  | Duration each dashed outline stays during initial carousel (ms) |
| `enableInitRegionFlash` | `boolean` | `true`  | Enable initial carousel animation                               |


> Full default constants: `DEFAULT_MASK_CONFIG`, `DEFAULT_PIPELINE_CONFIG`, `DEFAULT_PAINT_CONFIG`, `DEFAULT_INTERACTION_CONFIG` (exported from the package entry).

### 🎛️ Props: UI Controls & Styling


| Prop                                             | Type                   | Default             | Description                                               |
| ------------------------------------------------ | ---------------------- | ------------------- | --------------------------------------------------------- |
| `showToolbar`                                    | `boolean`              | `true`              | Top toolbar ("Clear cache & re-segment")                  |
| `showColorBar`                                   | `boolean`              | `true`              | Bottom brush color strip                                  |
| `showStatusRow`                                  | `boolean`              | `true`              | Segmentation/loading status text                          |
| `showOverlayButtons`                             | `boolean`              | `true`              | Bottom-left undo, bottom-right compare buttons            |
| `showDebugPickers`                               | `boolean`              | `true`              | Photo library debug picker (set to `false` in production) |
| `disabled`                                       | `boolean`              | `false`             | Disable paint interaction                                 |
| `style`                                          | `ViewStyle`            | —                   | Outer container style                                     |
| `canvasStyle`                                    | `ViewStyle`            | —                   | Canvas area style                                         |
| `undoButtonStyle` / `compareButtonStyle`         | `ViewStyle`            | —                   | Overlay button styles                                     |
| `undoButtonTextStyle` / `compareButtonTextStyle` | `TextStyle`            | —                   | Overlay button text styles                                |
| `undoButtonText`                                 | `string`               | `Undo` (zh)         | Undo button label                                         |
| `compareButtonText`                              | `string`               | `Compare` (zh)      | Enter compare mode label                                  |
| `compareExitButtonText`                          | `string`               | `Exit Compare` (zh) | Exit compare mode label                                   |
| `renderUndoButton`                               | `(props) => ReactNode` | —                   | Custom undo button renderer                               |
| `renderCompareButton`                            | `(props) => ReactNode` | —                   | Custom compare button renderer                            |


### 📞 Props: Callbacks


| Prop              | Signature                                 | Description                                                                  |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| `onWatch`         | `(state, durationMs, detail?) => void`    | Initialization stage callback; `durationMs` is relative to this `init` start |
| `onPaintCallback` | `(payload: PaintCallbackPayload) => void` | Fires on successful paint, or when tapping a region without a brush selected |
| `onError`         | `(message, error?) => void`               | Segmentation or loading failure                                              |


`PaintCallbackPayload` (discriminated union, distinguished by `payload.kind`):

```ts
// Successful paint
{
  kind: 'painted';
  regionId: number;
  regionName: string;
  color: BgrColor;
  configJson?: Record<string, unknown>; // from setPaintColor / initialPaintConfigJson
}

// Tapped a valid region without selecting a brush (no paint performed)
{
  kind: 'brush_required';
  hint: string;       // e.g. "Please select a brush color first (bottom color bar or ref.setPaintColor)"
  regionId: number;
  regionName: string;
}
```

Example:

```tsx
onPaintCallback={payload => {
  if (payload.kind === 'brush_required') {
    showToast(payload.hint);
    return;
  }
  savePaintRecord(payload.regionId, payload.color, payload.configJson);
}}
```

`onWatch` `detail` (`MaskSegmentWatchDetail`):


| Field             | Type      | Description                                 |
| ----------------- | --------- | ------------------------------------------- |
| `regionCount`     | `number`  | Current effective region count              |
| `maskPathsReady`  | `boolean` | Whether outline Skia paths are ready        |
| `freqLayersReady` | `boolean` | Whether frequency Shader textures are ready |
| `errorMessage`    | `string`  | Failure description in `error` state        |


#### onWatch State Flow

```
init
  → images_loaded      Origin + mask read complete
  → mask_aligned       Mask dimensions aligned
  → mask_sampled       Mask pixel sampling complete
  → regions_ready      Region extraction succeeded
  → layers_ready       Paint texture layers ready (detail.maskPathsReady may still be false)
  → interactive        Interactive (can tap regions, select colors, paint)
  → mask_paths_ready   Outline paths ready (carousel dashed outlines can display; detail.maskPathsReady is true)
  → error              Failure (detail.errorMessage has description)
```

`layers_ready` / `interactive` may fire before outline paths finish computing. If the host dismisses a blocking loader at `interactive`, the user can already operate; carousel dashed outlines appear automatically after `mask_paths_ready`.

### 🔧 Ref Methods

Accessed via `ref` (type `MaskSegmentCanvasRef`):


| Method              | Signature                                | Description                                                                 |
| ------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| `reset`             | `() => void`                             | Undo last paint step (by `paintHistory`)                                    |
| `swap`              | `(showOrigin?: boolean) => void`         | Toggle origin image comparison; omit arg to toggle, `true`/`false` to force |
| `save`              | `(options?) => Promise<SavePaintResult>` | Composite and save PNG; `options.destDir` optional output directory         |
| `session`           | `() => MaskSegmentSession`               | Export JSON-serializable session (for MMKV storage)                         |
| `loadSession`       | `(session) => void`                      | Restore paint state (also available via `initialSession`)                   |
| `setPaintColor`     | `(color, configJson?) => void`           | Set current brush color; clears bottom color bar selection                  |
| `setMaskConfig`     | `(config) => void`                       | Update mask config at runtime and **re-segment**                            |
| `clearAllPaint`     | `() => void`                             | Clear all paint records                                                     |
| `resegment`         | `() => Promise<void>`                    | Clear PNG cache and re-segment                                              |
| `getRegions`        | `() => SegmentRegion[]`                  | Snapshot of current region list                                             |
| `getPaintedRegions` | `() => PaintedRegionRecord[]`            | Snapshot of current paint records                                           |


`SavePaintResult`: `{ filePath, width, height, paintedCount, previewPath? }`

Code examples:

```tsx
const ref = useRef<MaskSegmentCanvasRef>(null);

ref.current?.reset();
ref.current?.swap();           // toggle
ref.current?.swap(true);       // force show origin

const result = await ref.current?.save({ destDir: '/path/to/dir' });

const session = ref.current?.session();
ref.current?.loadSession(session);

ref.current?.setPaintColor({ b: 100, g: 120, r: 140 }, { sku: 'paint-001' });
ref.current?.setMaskConfig({ semanticColors: customColors });

ref.current?.clearAllPaint();
await ref.current?.resegment();

const regions = ref.current?.getRegions();
const painted = ref.current?.getPaintedRegions();
```

> `save` depends on the working buffer and pickMap being ready (typically after `interactive`); throws `'Image not ready, cannot save'` if not ready.

### 💾 Storage Convention


| Capability      | Recommended Storage | Content                                                |
| --------------- | ------------------- | ------------------------------------------------------ |
| `ref.save()`    | File system         | Full-res PNG path                                      |
| `ref.session()` | MMKV / AsyncStorage | JSON metadata (URLs, paint records, brush color, etc.) |


`MaskSegmentSession` structure:

```ts
{
  version: 1;
  originUrl: string;
  maskUrl: string;
  painted: PaintedRegionRecord[];  // { regionId, regionName, color, configJson? }
  paintHistory: number[];
  currentColor?: BgrColor;
  currentColorConfigJson?: Record<string, unknown>;
  savedAt: number;
}
```

---

## 🎮 Interaction Guide

1. 🔁 **Initial Carousel**: After regions are ready, each region's dashed outline flashes sequentially per `initRegionFlashMs` (default 1s); stops on first user touch.
2. 🔍 **Preview (no brush selected)**: Long-press a region to show dashed outline for the connected component under the touch point; tapping a black area shows no outline.
3. 🎨 **Paint (brush selected)**: Tap a color in the bottom color bar or call `ref.setPaintColor` (or preselect via `initialPaintColor`), then tap a region to paint; tapping the same region again overwrites the color.
4. 💬 **Tap without brush**: No paint is performed; `onPaintCallback` fires with `kind: 'brush_required'`, carrying a `hint` and target region info for the host to show a toast/modal prompting color selection.
5. ↩️ **Undo**: Bottom-left button or `ref.reset()`; steps backward through paint history one action at a time.
6. 👁️ **Compare with Origin**: Bottom-right button or `ref.swap()`; hides the paint layer to show the original image.

---

## 🧩 Integration Examples

### 🔥 Pre-warm PNG Cache (Recommended)

```tsx
import { prewarmPngBgrCacheAsync } from 'react-native-mask-segment-canvas';

async function openPaintScreen(originUrl: string, maskUrl: string) {
  await prewarmPngBgrCacheAsync([originUrl, maskUrl]);
  navigation.navigate('Paint', { originUrl, maskUrl });
}
```

### 🌐 Passing Local Paths from an API

```tsx
<MaskSegmentCanvas
  originUrl={localOriginPath}
  maskUrl={localMaskPath}
  showDebugPickers={false}
  showToolbar={false}
  semanticColors={MASK_SEMANTIC_COLORS}
  regionOutlineColor="#1e96ff"
  onWatch={(state, ms, detail) => {
    if (state === 'interactive') hideBlockingLoader();
    if (state === 'mask_paths_ready') hideOutlineHint();
  }}
/>
```

### 💾 Draft Recovery

```tsx
const draft = JSON.parse(mmkv.getString('paint_draft'));

<MaskSegmentCanvas
  originUrl={draft.originUrl}
  maskUrl={draft.maskUrl}
  initialSession={draft}
/>
```

### 🎨 Custom Semantic Color Table

```tsx
const gymColors: MaskSemanticColor[] = [
  { name: 'wall', hex: '#4363D8', bgr: { b: 216, g: 99, r: 67 } },
  { name: 'ceiling', hex: '#3CB44B', bgr: { b: 75, g: 180, r: 60 } },
  // ...
];

<MaskSegmentCanvas
  semanticColors={gymColors}
  maskConfig={{ blackThreshold: 30, maxRegionColors: 6 }}
/>
```

---

## 📁 Project Structure

```
MaskSegmentApp/                              # Repo root (npm package react-native-mask-segment-canvas)
├── App.tsx                                  # Dev self-test Demo (imports from ./src directly)
├── src/
│   ├── index.ts                             # Package entry (consumer: import 'react-native-mask-segment-canvas')
│   ├── components/
│   │   ├── MaskSegmentCanvas.tsx
│   │   └── MaskSegmentCanvas.types.ts
│   └── utils/
│       ├── maskSegmentation.ts
│       ├── maskSegmentRuntime.ts
│       ├── maskSemanticPalette.ts
│       └── ...
├── example/                                 # ★ Recommended: consumer-side integration demo
│   ├── App.tsx                              # Full example using only the public API
│   ├── index.js / app.json
│   ├── package.json                         # Required deps + "react-native-mask-segment-canvas": "file:.."
│   ├── metro.config.js / babel.config.js / tsconfig.json
│   └── README.md                            # How to integrate in a real project
├── patches/                                 # Shipped with the package; applied by host postinstall
├── ios/                                     # Root Demo native project (not published to npm)
└── android/
```

---

## 📚 Dependencies


| Package                          | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `@shopify/react-native-skia`     | Canvas rendering, Path, dashed strokes, Blend compositing |
| `react-native-fast-opencv`       | Mask morphology, contour processing                       |
| `react-native-fs`                | Layer caching, PNG save                                   |
| `react-native-image-picker`      | Demo photo library picker                                 |
| `react-native-reanimated`        | Skia animation dependency                                 |
| `react-native-safe-area-context` | Safe area insets                                          |


---

## ⚡ Performance

The data below is based on the Demo test image (`assets/test/origin.png` **1080×1920**, 6 semantic regions), **default `pipelineConfig`**, and `onWatch` `durationMs` (measured from `init`). These are **empirical ranges**, not strict benchmarks; actual device results vary with CPU, storage, and RN version.

### 📏 Measured Reference (Dev Env + PNG Pre-warming)

The Demo calls `prewarmPngBgrCacheAsync([origin, mask])` before mounting the canvas, so PNG decoding hits the memory cache. Typical logs:


| Stage           | watchState                       | Approx. Duration | Notes                                                     |
| --------------- | -------------------------------- | ---------------- | --------------------------------------------------------- |
| Mask aligned    | `mask_aligned`                   | ~160ms           | Mask scaled to segmentation working resolution            |
| Regions ready   | `regions_ready` / `mask_sampled` | ~320ms           | Layout scan + baseboard + pickMap                         |
| **Interactive** | `**interactive`**                | **~320–450ms**   | Can tap regions, select colors, Shader paint              |
| Outlines ready  | `mask_paths_ready`               | ~430–550ms       | ~100ms after `interactive`; carousel outlines can display |


`interactive` does **not wait** for outline paths; `mask_paths_ready` only affects the initial carousel and optional UI hints.

Same-image sub-step magnitudes (`__DEV__` logs, default pipeline):


| Sub-step                                 | Approx. Duration | Working Resolution             |
| ---------------------------------------- | ---------------- | ------------------------------ |
| OpenCV LAB high/low freq                 | ~10–40ms         | 270×480                        |
| High/low freq Skia textures              | ~20–30ms         | same                           |
| Layout scan + baseboard + pick table     | ~90–120ms        | 405×720 (1080p → longSide 720) |
| Full contour paths (async, non-blocking) | ~80–150ms        | 270×480                        |


### 📐 Resolution vs pipelineConfig

Compute-intensive steps are capped by **maximum long side limits** and do **not scale linearly with 4K/8K origin images**. **Full PNG decoding** still scales linearly with pixel count.


| Step                     | Config Key                  | 1080×1920 Actual Size | Scales with Origin Pixels             |
| ------------------------ | --------------------------- | --------------------- | ------------------------------------- |
| PNG decode               | —                           | 1080×1920 × 2 images  | **Yes**                               |
| Mask seg / pickMap       | `maxImageLongSide: 720`     | ~405×720              | **No** (fixed when long side >720)    |
| Shader high/low freq     | `paintFreqMaxLongSide: 480` | ~270×480              | **No**                                |
| Working area Skia origin | same as `maxImageLongSide`  | ~405×720              | **No**                                |
| Dashed outlines          | `maskPathMaxLongSide: 480`  | ~270×480              | **No** (does not block `interactive`) |


### ⏱️ interactive Estimation (Default Pipeline)


| Origin Spec    | Relative to 1080p Pixels | With PNG Pre-warm | Cold Start (no pre-warm) |
| -------------- | ------------------------ | ----------------- | ------------------------ |
| 1080×1920      | 1×                       | **320–450ms**     | **450–700ms**            |
| 1440×2560 (2K) | ~1.8×                    | **400–550ms**     | **600–900ms**            |
| 3840×2160 (4K) | ~4×                      | **500–750ms**     | **800–1200ms**           |
| 7680×4320 (8K) | ~16×                     | **0.8–1.5s**      | **1.5–3s+**              |


> **<300ms interactive**: achievable on 1080p + pre-warm + default pipeline + high-end devices, but **optimistic** — do not treat as an all-device SLA.

### 📱 Device Tier (1080p, Default Pipeline)

Relative to the ~320ms dev-environment baseline:


| Tier                                | Relative Multiplier | Pre-warm `interactive` | Cold Start |
| ----------------------------------- | ------------------- | ---------------------- | ---------- |
| Flagship iOS / new flagship Android | 0.8–1.2×            | 300–450ms              | 500–800ms  |
| Mid-range Android                   | 1.5–2.5×            | 500–800ms              | 700ms–1.2s |
| Low-end Android (4GB, old SoC)      | 2.5–4×              | 800ms–1.3s             | 1–2s+      |


Android overhead primarily comes from: JS ↔ OpenCV bridge, memory bandwidth/GC, Skia texture upload.

### 📈 Impact of Raising maxImageLongSide

Setting `pipelineConfig.maxImageLongSide` to **1280** (above the default 720) results in a segmentation working area of ~720×1280, roughly **3×** the pixel count of the 720 tier:


| Scenario                        | Default 720 | Raised to 1280 |
| ------------------------------- | ----------- | -------------- |
| 1080p `interactive` (mid-range) | ~320–800ms  | **500ms–1s+**  |
| Segmentation / pickMap duration | ~90–120ms   | ~250–350ms     |


Higher precision for longer init time. To stay **<500ms interactive**, keep the default **720**; reduce to **640** if needed.

### 💨 Optimization Tips

1. 🚀 **PNG pre-warming (recommended)**: Call `prewarmPngBgrCacheAsync` after download/extraction and before navigating to the paint screen. Typically saves **100–250ms** (greatest benefit on low-end devices).

```tsx
import { prewarmPngBgrCacheAsync } from 'react-native-mask-segment-canvas';

await prewarmPngBgrCacheAsync([originPath, maskPath]);
// Then mount MaskSegmentCanvas
```

1. ⏱️ **Loading timing**: Dismiss the blocking loader at `interactive`; optionally listen for `mask_paths_ready` for "outlines preparing" hints.
2. 🖼️ **Large images / low-end devices**: Keep default `maxImageLongSide: 720`; optionally lower `paintFreqMaxLongSide` to **360**.
3. 📷 **4K assets**: Downsample on the host side before passing in, or accept ~0.8–1.5s `interactive` (with pre-warm).
4. 🔍 **Observability**: Watch Metro logs for `[MaskSegment]`, `[⏱ ...]` prefixes and `onWatch` `durationMs`.

---

## 📝 Notes

- The mask image should be a semantic color-block image with the same dimensions as the origin (black background + solid-color regions). Pixels with `max(B,G,R) < blackThreshold` (default 30) are excluded from segmentation.
- OpenCV segmentation runs on the JS thread; very large images may cause frame drops. Use `pipelineConfig.maxImageLongSide` to cap processing resolution.
- iOS photo library access requires photo permissions (only needed when `showDebugPickers` is enabled).
- `semanticColors` must match the semantic colors used in the backend/labeled mask; mismatch will cause recognition drift.

---

## 🔧 Troubleshooting

**iOS pod install fails**

```bash
cd ios
bundle install
bundle exec pod install --repo-update
```

**Android build errors**

```bash
cd android && ./gradlew clean && cd ..
```

**Segmentation fails / zero regions**

- Verify `originUrl` / `maskUrl` are accessible
- Confirm mask semantic colors match the `semanticColors` config
- Check Metro logs for `[MaskSegment]` / `[⏱ ...]` output

**Dashed outlines misaligned / extra contours**

- Outlines are generated from mask pixel external contours; long-press only shows the connected component at the touch point
- The initial carousel only shows the largest connected component for each semantic region

