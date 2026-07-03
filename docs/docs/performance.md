---
id: performance
title: Performance
---

# ⚡ Performance

The data below is based on the Demo test image (`assets/test/origin.png` **1080×1920**, 6 semantic regions), **default `pipelineConfig`**, and `onWatch` `durationMs` (measured from `init`). These are **empirical ranges**, not strict benchmarks; actual device results vary with CPU, storage, and RN version.

## Measured Reference (Dev Env + PNG Pre-warming)

The Demo calls `prewarmPngBgrCacheAsync([origin, mask])` before mounting the canvas, so PNG decoding hits the memory cache. Typical logs:

| Stage | watchState | Approx. Duration | Notes |
| --- | --- | --- | --- |
| Mask aligned | `mask_aligned` | ~160ms | Mask scaled to segmentation working resolution |
| Regions ready | `regions_ready` / `mask_sampled` | ~320ms | Layout scan + baseboard + pickMap |
| **Interactive** | `**interactive`** | **~320–450ms** | Can tap regions, select colors, Shader paint |
| Outlines ready | `mask_paths_ready` | ~430–550ms | ~100ms after `interactive`; carousel outlines can display |

`interactive` does **not wait** for outline paths; `mask_paths_ready` only affects the initial carousel and optional UI hints.

Same-image sub-step magnitudes (`__DEV__` logs, default pipeline):

| Sub-step | Approx. Duration | Working Resolution |
| --- | --- | --- |
| OpenCV LAB high/low freq | ~10–40ms | 270×480 |
| High/low freq Skia textures | ~20–30ms | same |
| Layout scan + baseboard + pick table | ~90–120ms | 405×720 (1080p → longSide 720) |
| Full contour paths (async, non-blocking) | ~80–150ms | 270×480 |

## Resolution vs pipelineConfig

Compute-intensive steps are capped by **maximum long side limits** and do **not scale linearly with 4K/8K origin images**. **Full PNG decoding** still scales linearly with pixel count.

| Step | Config Key | 1080×1920 Actual Size | Scales with Origin Pixels |
| --- | --- | --- | --- |
| PNG decode | — | 1080×1920 × 2 images | **Yes** |
| Mask seg / pickMap | `maxImageLongSide: 720` | ~405×720 | **No** (fixed when long side >720) |
| Shader high/low freq | `paintFreqMaxLongSide: 480` | ~270×480 | **No** |
| Working area Skia origin | same as `maxImageLongSide` | ~405×720 | **No** |
| Dashed outlines | `maskPathMaxLongSide: 480` | ~270×480 | **No** (does not block `interactive`) |

## interactive Estimation (Default Pipeline)

| Origin Spec | Relative to 1080p Pixels | With PNG Pre-warm | Cold Start (no pre-warm) |
| --- | --- | --- | --- |
| 1080×1920 | 1× | **320–450ms** | **450–700ms** |
| 1440×2560 (2K) | ~1.8× | **400–550ms** | **600–900ms** |
| 3840×2160 (4K) | ~4× | **500–750ms** | **800–1200ms** |
| 7680×4320 (8K) | ~16× | **0.8–1.5s** | **1.5–3s+** |

> **`<300ms` interactive**: achievable on 1080p + pre-warm + default pipeline + high-end devices, but **optimistic** — do not treat as an all-device SLA.

## Device Tier (1080p, Default Pipeline)

Relative to the ~320ms dev-environment baseline:

| Tier | Relative Multiplier | Pre-warm `interactive` | Cold Start |
| --- | --- | --- | --- |
| Flagship iOS / new flagship Android | 0.8–1.2× | 300–450ms | 500–800ms |
| Mid-range Android | 1.5–2.5× | 500–800ms | 700ms–1.2s |
| Low-end Android (4GB, old SoC) | 2.5–4× | 800ms–1.3s | 1–2s+ |

Android overhead primarily comes from: JS ↔ OpenCV bridge, memory bandwidth/GC, Skia texture upload.

## Impact of Raising maxImageLongSide

Setting `pipelineConfig.maxImageLongSide` to **1280** (above the default 720) results in a segmentation working area of ~720×1280, roughly **3×** the pixel count of the 720 tier:

| Scenario | Default 720 | Raised to 1280 |
| --- | --- | --- |
| 1080p `interactive` (mid-range) | ~320–800ms | **500ms–1s+** |
| Segmentation / pickMap duration | ~90–120ms | ~250–350ms |

Higher precision for longer init time. To stay **`<500ms` interactive**, keep the default **720**; reduce to **640** if needed.

## Optimization Tips

1. 🚀 **PNG pre-warming (recommended)**: Call `prewarmPngBgrCacheAsync` after download/extraction and before navigating to the paint screen. Typically saves **100–250ms** (greatest benefit on low-end devices).

```tsx
import { prewarmPngBgrCacheAsync } from 'react-native-mask-segment-canvas';

await prewarmPngBgrCacheAsync([originPath, maskPath]);
// Then mount MaskSegmentCanvas
```

2. ⏱️ **Loading timing**: Dismiss the blocking loader at `interactive`; optionally listen for `mask_paths_ready` for "outlines preparing" hints.
3. 🖼️ **Large images / low-end devices**: Keep default `maxImageLongSide: 720`; optionally lower `paintFreqMaxLongSide` to **360**.
4. 📷 **4K assets**: Downsample on the host side before passing in, or accept ~0.8–1.5s `interactive` (with pre-warm).
5. 🔍 **Observability**: Watch Metro logs for `[MaskSegment]`, `[⏱ ...]` prefixes and `onWatch` `durationMs`.
