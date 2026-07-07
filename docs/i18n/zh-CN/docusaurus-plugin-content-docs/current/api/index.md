---
id: index
title: API 参考
---

# 📖 API 参考

## 导入

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
  type LassoPolygon,
  type ManualWallPartition,
  MASK_SEMANTIC_COLORS,
  BASEBOARD_SEMANTIC_NAME,
  prewarmPngBgrCacheAsync,
  DEFAULT_PIPELINE_CONFIG,
  DEFAULT_MASK_CONFIG,
  DEFAULT_PAINT_CONFIG,
  DEFAULT_INTERACTION_CONFIG,
} from 'react-native-mask-segment-canvas';
```

| 分类 | 名称 |
| --- | --- |
| 组件 | `MaskSegmentCanvas`（默认导出） |
| Ref / Props 类型 | `MaskSegmentCanvasRef`, `MaskSegmentCanvasProps` |
| 会话 / 回调类型 | `MaskSegmentSession`, `PaintCallbackPayload`, `PaintedRegionRecord`, `SavePaintResult` |
| 套索类型 | `LassoPolygon`, `ManualWallPartition` |
| Watch 类型 | `MaskSegmentWatchState`, `MaskSegmentWatchDetail` |
| 配置类型 | `PipelineConfig`, `MaskSegmentConfig`, `PaintConfig`, `InteractionConfig` |
| 语义颜色 | `MASK_SEMANTIC_COLORS`, `BASEBOARD_SEMANTIC_NAME` |
| 工具函数 | `prewarmPngBgrCacheAsync` |
| 运行时默认值 | `DEFAULT_*_CONFIG` |

---

## Props 概览

| 分类 | 描述 |
| --- | --- |
| [图像与初始化](/docs/api/props-image) | `originUrl`, `maskUrl`, `initialSession`, `initialPaintColor` |
| [语义颜色与轮廓](/docs/api/props-semantic) | `semanticColors`, `regionOutlineColor` |
| [maskConfig](/docs/api/mask-config) | 分割和语义区域配置 |
| [pipelineConfig](/docs/api/pipeline-config) | 分辨率和处理管线配置 |
| [paintConfig](/docs/api/paint-config) | 上色渲染和纹理混合配置 |
| [interactionConfig](/docs/api/interaction-config) | 触摸交互和命中测试配置 |
| [UI 控件与样式](/docs/api/ui-controls) | 可见性开关、自定义渲染器、样式 |
| [回调](/docs/api/callbacks) | `onWatch`, `onPaintCallback`, `onError` |
| [Ref 方法](/docs/api/ref-methods) | 通过 `ref` 调用的命令式方法 |
| [存储约定](/docs/api/storage) | 会话持久化和 PNG 导出 |
