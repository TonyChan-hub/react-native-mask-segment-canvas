---
id: local-paths
title: Passing Local Paths from an API
---

# 🌐 Passing Local Paths from an API

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
