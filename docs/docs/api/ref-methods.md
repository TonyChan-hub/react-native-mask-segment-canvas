---
id: ref-methods
title: "Ref Methods"
---

# 🔧 Ref Methods

Accessed via `ref` (type `MaskSegmentCanvasRef`):

| Method | Signature | Description |
| --- | --- | --- |
| `reset` | `() => void` | Undo last paint step (by `paintHistory`) |
| `swap` | `(showOrigin?: boolean) => void` | Toggle origin image comparison; omit arg to toggle, `true`/`false` to force |
| `save` | `(options?) => Promise<SavePaintResult>` | Composite and save PNG; `options.destDir` optional output directory |
| `session` | `() => MaskSegmentSession` | Export JSON-serializable session (for MMKV storage) |
| `loadSession` | `(session) => void` | Restore paint state (also available via `initialSession`) |
| `setPaintColor` | `(color, configJson?) => void` | Set current brush color; clears bottom color bar selection |
| `setMaskConfig` | `(config) => void` | Update mask config at runtime and **re-segment** |
| `clearAllPaint` | `() => void` | Clear all paint records |
| `resegment` | `() => Promise<void>` | Clear PNG cache and re-segment |
| `getRegions` | `() => SegmentRegion[]` | Snapshot of current region list |
| `getPaintedRegions` | `() => PaintedRegionRecord[]` | Snapshot of current paint records |
| `getLastExport` | `() => SavePaintResult \| null` | Returns the most recent auto-export or `save()` result, if any |
| `startLasso` | `() => void` | Enter lasso mode — user can tap wall mask area to place polygon vertices |
| `endLasso` | `() => ManualWallPartition[]` | Exit lasso mode, convert all closed lasso polygons into `wall-X` sub-regions for painting |
| `cancelLasso` | `() => void` | Exit the current lasso editing session without saving regions |
| `getManualRegions` | `() => ManualWallPartition[]` | Get the current manual wall partitions (only valid after `endLasso`) |
| `deleteLasso` | `(id: string) => void` | Delete a lasso polygon by its id. Committed partitions also drop paint on that region |

## SavePaintResult

`{ filePath, width, height, paintedCount, previewPath? }`

## ManualWallPartition

`{ id, regionId, regionName, vertices, bbox, area }`

Returned by `endLasso()` and `getManualRegions()`. Each partition maps a lasso polygon to a `wall-N` sub-region.

## Code Examples

```tsx
const ref = useRef<MaskSegmentCanvasRef>(null);

// Paint operations
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

// Lasso operations
ref.current?.startLasso();                // enter lasso mode
// ... user taps wall areas to place vertices ...
const partitions = ref.current?.endLasso();  // convert polygons to wall-N regions
ref.current?.cancelLasso();               // discard in-progress lasso

const manualRegions = ref.current?.getManualRegions();
ref.current?.deleteLasso('lasso_1');      // remove a specific polygon
```

> `save` depends on the working buffer and pickMap being ready (typically after `interactive`); throws `'Image not ready, cannot save'` if not ready.
