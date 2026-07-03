---
id: props-semantic
title: "Props: Semantic Colors & Outline"
---

# 🎨 Props: Semantic Colors & Outline

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `semanticColors` | `MaskSemanticColor[]` | `MASK_SEMANTIC_COLORS` | Mask semantic recognition colors; equivalent to `maskConfig.semanticColors` |
| `regionOutlineColor` | `string` | `rgba(20, 120, 235, 0.58)` | Region dashed highlight color; equivalent to `paintConfig.regionOverlayFill` |

Top-level props take priority over nested `maskConfig` / `paintConfig`.

## MaskSemanticColor Structure

```ts
{
  name: string;   // Semantic name, e.g. wall / ceiling / baseboard
  hex: string;    // Display hex color
  bgr: { b: number; g: number; r: number }; // Must match mask pixel BGR channels
}
```

Built-in palette: `MASK_SEMANTIC_COLORS` (see `src/utils/maskSemanticPalette.ts`).
