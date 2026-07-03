---
id: props-image
title: "Props：图像与初始化"
---

# 🖼️ Props：图像与初始化

| Prop | 类型 | 必填 | 默认值 | 描述 |
| --- | --- | --- | --- | --- |
| `originUrl` | `string` | 是* | — | 原始图像 URL（`file://`、绝对路径或 `http(s)://`） |
| `maskUrl` | `string` | 是* | — | 遮罩图像 URL（语义色块图；建议与原始图像尺寸相同） |
| `originImgPath` | `string` | — | — | **已弃用** — 请使用 `originUrl` |
| `maskImgPath` | `string` | — | — | **已弃用** — 请使用 `maskUrl` |
| `initialSession` | `MaskSegmentSession` | 否 | — | 从 MMKV 等恢复的草稿；区域就绪后自动调用 `loadSession` |
| `initialPaintColor` | `BgrColor` | 否 | — | **可选**。初始自定义画笔颜色 `{ b, g, r }`；省略时默认不选中画笔；用户需选择颜色或调用 `ref.setPaintColor` |
| `initialPaintConfigJson` | `Record<string, unknown>` | 否 | — | **可选**。`initialPaintColor` 的附带画笔配置；成功上色时通过 `onPaintCallback` 返回 |

\* 使用时至少需要 `originUrl` / `maskUrl` 之一。
