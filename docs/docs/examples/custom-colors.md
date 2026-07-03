---
id: custom-colors
title: Custom Semantic Color Table
---

# 🎨 Custom Semantic Color Table

Define custom semantic colors when your mask uses different color values:

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

:::caution
`semanticColors` must match the semantic colors used in the backend/labeled mask; mismatch will cause recognition drift.
:::
