---
id: props-semantic
title: "Props：语义颜色与轮廓"
---

# 🎨 Props：语义颜色与轮廓

| Prop | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `semanticColors` | `MaskSemanticColor[]` | `MASK_SEMANTIC_COLORS` | 遮罩语义识别颜色；等同于 `maskConfig.semanticColors` |
| `regionOutlineColor` | `string` | `rgba(20, 120, 235, 0.58)` | 区域虚线高亮颜色；等同于 `paintConfig.regionOverlayFill` |

顶层 props 优先于嵌套的 `maskConfig` / `paintConfig`。

## MaskSemanticColor 结构

```ts
{
  name: string;   // 语义名称，如 wall / ceiling / baseboard
  hex: string;    // 显示用的十六进制颜色
  bgr: { b: number; g: number; r: number }; // 必须与遮罩像素 BGR 通道匹配
}
```

内置调色板：`MASK_SEMANTIC_COLORS`（详见 `src/utils/maskSemanticPalette.ts`）。
