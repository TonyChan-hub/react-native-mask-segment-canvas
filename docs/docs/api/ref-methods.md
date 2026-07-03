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

## SavePaintResult

`{ filePath, width, height, paintedCount, previewPath? }`

## Code Examples

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
