---
id: index
title: API Reference
---

# 📖 API Reference

## Imports

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

| Category | Names |
| --- | --- |
| Component | `MaskSegmentCanvas` (default) |
| Ref / Props types | `MaskSegmentCanvasRef`, `MaskSegmentCanvasProps` |
| Session / callback types | `MaskSegmentSession`, `PaintCallbackPayload`, `PaintedRegionRecord`, `SavePaintResult` |
| Watch types | `MaskSegmentWatchState`, `MaskSegmentWatchDetail` |
| Config types | `PipelineConfig`, `MaskSegmentConfig`, `PaintConfig`, `InteractionConfig` |
| Semantic colors | `MASK_SEMANTIC_COLORS`, `BASEBOARD_SEMANTIC_NAME` |
| Utilities | `prewarmPngBgrCacheAsync` |
| Runtime defaults | `DEFAULT_*_CONFIG` |

---

## Props Overview

| Category | Description |
| --- | --- |
| [Image & Initialization](/docs/api/props-image) | `originUrl`, `maskUrl`, `initialSession`, `initialPaintColor` |
| [Semantic Colors & Outline](/docs/api/props-semantic) | `semanticColors`, `regionOutlineColor` |
| [maskConfig](/docs/api/mask-config) | Segmentation and semantic region configuration |
| [pipelineConfig](/docs/api/pipeline-config) | Resolution and processing pipeline configuration |
| [paintConfig](/docs/api/paint-config) | Paint rendering and texture blending configuration |
| [interactionConfig](/docs/api/interaction-config) | Touch interaction and hit testing configuration |
| [UI Controls & Styling](/docs/api/ui-controls) | Visibility toggles, custom renderers, styling |
| [Callbacks](/docs/api/callbacks) | `onWatch`, `onPaintCallback`, `onError` |
| [Ref Methods](/docs/api/ref-methods) | Imperative methods via `ref` |
| [Storage Convention](/docs/api/storage) | Session persistence and PNG export |
