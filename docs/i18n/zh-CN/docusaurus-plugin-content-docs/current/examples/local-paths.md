---
id: local-paths
title: 从 API 传入本地路径
---

# 🌐 从 API 传入本地路径

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
