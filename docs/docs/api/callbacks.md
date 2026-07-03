---
id: callbacks
title: "Props: Callbacks"
---

# 📞 Props: Callbacks

| Prop | Signature | Description |
| --- | --- | --- |
| `onWatch` | `(state, durationMs, detail?) => void` | Initialization stage callback; `durationMs` is relative to this `init` start |
| `onPaintCallback` | `(payload: PaintCallbackPayload) => void` | Fires on successful paint, or when tapping a region without a brush selected |
| `onError` | `(message, error?) => void` | Segmentation or loading failure |

## PaintCallbackPayload

(Discriminated union, distinguished by `payload.kind`):

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

## onWatch detail (MaskSegmentWatchDetail)

| Field | Type | Description |
| --- | --- | --- |
| `regionCount` | `number` | Current effective region count |
| `maskPathsReady` | `boolean` | Whether outline Skia paths are ready |
| `freqLayersReady` | `boolean` | Whether frequency Shader textures are ready |
| `errorMessage` | `string` | Failure description in `error` state |

### onWatch State Flow

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
