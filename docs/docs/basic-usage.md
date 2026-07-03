---
id: basic-usage
title: Basic Usage
---

# 💡 Basic Usage

## 🧑‍💻 Minimal Example

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
    return () => { cancelled = true; };
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

---

## 📊 State Variables

| State | Type | Purpose |
| --- | --- | --- |
| `imagePaths` | `{ origin, mask } \| null` | Local/remote image paths resolved by the host |
| `pathsError` | `string` | Error message when path resolution or PNG pre-warming fails |
| `watchState` | `MaskSegmentWatchState \| ''` | Initialization stage reported by `onWatch` |
| `isInteractive` | derived | `true` when `interactive` or `mask_paths_ready` — operations are allowed |
| `isOutlineReady` | derived | `true` when `mask_paths_ready` — carousel dashed outlines are ready |
| `isCanvasLoading` | derived | Canvas init is blocking (not including PNG path waiting) |
| `errorMessage` | `string` | Segmentation/loading failure message written by `onError` |
| `sessionDraft` | `MaskSegmentSession \| null` | Draft restored from MMKV or similar storage |

---

## ⚙️ Choosing Configuration Values

| Config | Use top-level prop when... | Use nested Config when... |
| --- | --- | --- |
| Semantic colors | `semanticColors={...}` for most cases | `maskConfig.semanticColors` when paired with other mask params |
| Outline color | `regionOutlineColor="..."` for most cases | `paintConfig.regionOverlayFill` when also customizing the brush palette |
| Black threshold, max regions | — | `maskConfig` |
| Image processing size | — | `pipelineConfig` |
| Flash interval, tap tolerance | — | `interactionConfig` |

Top-level props and nested Configs **can coexist**; top-level `semanticColors` / `regionOutlineColor` take priority.

---

## 🔄 watchState & UI Guidance

```ts
// Blocking loading (before regions + paint layers are ready)
const isLoading = ![
  'interactive',
  'mask_paths_ready',
  'error',
  '',
].includes(watchState);

// Allow tapping regions, selecting colors, painting
const canOperate =
  watchState === 'interactive' || watchState === 'mask_paths_ready';

// Carousel dashed outlines are fully ready
const isOutlineReady = watchState === 'mask_paths_ready';

// Show error screen
const hasError = watchState === 'error';
```

At `interactive`, `detail.maskPathsReady` is typically `false`; at `mask_paths_ready`, it is `true`. The gap is roughly ~100ms (async Skia path construction) and does not block tap-to-paint.

`originUrl` / `maskUrl` support:

- Local paths: `file:///...` or absolute paths
- Remote URLs: `http(s)://...` (the component handles download and decoding internally)

> Legacy props `originImgPath` / `maskImgPath` are deprecated; use `originUrl` / `maskUrl` instead.
