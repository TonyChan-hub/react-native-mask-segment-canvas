---
id: custom-colors
title: 自定义语义颜色表
---

# 🎨 自定义语义颜色表

当遮罩使用不同的颜色值时，可以定义自定义语义颜色：

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
`semanticColors` 必须与后端/标注遮罩中使用的语义颜色匹配；不匹配会导致识别偏差。
:::
