---
id: paint-config
title: "Props：paintConfig"
---

# 🖌️ Props：paintConfig

| 字段 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `palette` | `BgrColor[]` | 6色内置调色板 | 底部画笔颜色条 |
| `colorBaseOpacity` | `number` | `0.88` | 基础颜色不透明度 |
| `lLightOpacity` | `number` | `0.50` | L 通道叠加强度 |
| `textureOpacity` | `number` | `0.85` | 高频纹理叠加强度（更强的纹理保留效果） |
| `lLowBlurKernel` | `number` | `7` | 低频高斯核（奇数） |
| `lLowContrast` | `number` | `1.15` | 低频对比度 |
| `lLowBrightness` | `number` | `0.9` | 低频亮度 |
| `lHighGain` | `number` | `1.22` | 高频增益 |
| `maskFeatherColor` | `number` | `1.6` | 上色边缘羽化（颜色）— 软边缘 alpha 半径，单位像素 |
| `maskFeatherTexture` | `number` | `0.9` | 上色边缘羽化（纹理）— 保留/辅助 |
| `regionOverlayFill` | `string` | `rgba(20,120,235,0.58)` | 虚线 / 高亮填充颜色 |
| `regionOutlineStrokeWidth` | `number` | `4` | 虚线轮廓描边宽度 |
