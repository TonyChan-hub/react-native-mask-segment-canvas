---
id: paint-config
title: "Props: paintConfig"
---

# 🖌️ Props: paintConfig

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `palette` | `BgrColor[]` | 6-color built-in | Bottom brush color strip |
| `colorBaseOpacity` | `number` | `0.88` | Base color opacity |
| `lLightOpacity` | `number` | `0.50` | L-channel overlay intensity |
| `textureOpacity` | `number` | `0.85` | High-frequency texture overlay intensity (stronger texture preservation) |
| `lLowBlurKernel` | `number` | `7` | Low-frequency Gaussian kernel (odd number) |
| `lLowContrast` | `number` | `1.15` | Low-frequency contrast |
| `lLowBrightness` | `number` | `0.9` | Low-frequency brightness |
| `lHighGain` | `number` | `1.22` | High-frequency gain |
| `maskFeatherColor` | `number` | `1.6` | Paint edge feathering (color) — soft-edge alpha radius, in pixels |
| `maskFeatherTexture` | `number` | `0.9` | Paint edge feathering (texture) — reserved/auxiliary |
| `regionOverlayFill` | `string` | `rgba(20,120,235,0.58)` | Dashed line / highlight fill color |
| `regionOutlineStrokeWidth` | `number` | `4` | Dashed outline stroke width |
