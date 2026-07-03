---
id: props-image
title: "Props: Image & Initialization"
---

# 🖼️ Props: Image & Initialization

| Prop | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `originUrl` | `string` | yes* | — | Origin image URL (`file://`, absolute path, or `http(s)://`) |
| `maskUrl` | `string` | yes* | — | Mask image URL (semantic color-block image; recommended same dimensions as origin) |
| `originImgPath` | `string` | — | — | **Deprecated** — use `originUrl` |
| `maskImgPath` | `string` | — | — | **Deprecated** — use `maskUrl` |
| `initialSession` | `MaskSegmentSession` | no | — | Draft restored from MMKV etc.; automatically calls `loadSession` after regions are ready |
| `initialPaintColor` | `BgrColor` | no | — | **Optional**. Initial custom brush color `{ b, g, r }`; if omitted, no brush is selected by default; user must select a color or call `ref.setPaintColor` |
| `initialPaintConfigJson` | `Record<string, unknown>` | no | — | **Optional**. Accompanying brush config for `initialPaintColor`; passed back via `onPaintCallback` on successful paint |

\* At least one of `originUrl` / `maskUrl` is required per usage context.
