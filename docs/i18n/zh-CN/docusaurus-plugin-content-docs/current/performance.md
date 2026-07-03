---
id: performance
title: 性能
---

# ⚡ 性能

以下数据基于 Demo 测试图片（`assets/test/origin.png` **1080×1920**，6 个语义区域）、**默认 `pipelineConfig`** 和 `onWatch` `durationMs`（从 `init` 开始测量）。这些是 **经验范围数据**，非严格基准测试；实际设备结果因 CPU、存储和 RN 版本而异。

## 实测参考（开发环境 + PNG 预热）

Demo 在挂载 Canvas 前调用 `prewarmPngBgrCacheAsync([origin, mask])`，因此 PNG 解码命中内存缓存。典型日志：

| 阶段 | watchState | 大约耗时 | 备注 |
| --- | --- | --- | --- |
| 遮罩对齐 | `mask_aligned` | ~160ms | 遮罩缩放至分割工作分辨率 |
| 区域就绪 | `regions_ready` / `mask_sampled` | ~320ms | 布局扫描 + 踢脚线 + pickMap |
| **可交互** | `**interactive`** | **~320–450ms** | 可点击区域、选择颜色、Shader 上色 |
| 轮廓就绪 | `mask_paths_ready` | ~430–550ms | `interactive` 后约 100ms；轮播轮廓可显示 |

`interactive` **不等待**轮廓路径；`mask_paths_ready` 仅影响初始轮播和可选的 UI 提示。

同图子步骤耗时大小（`__DEV__` 日志，默认 pipeline）：

| 子步骤 | 大约耗时 | 工作分辨率 |
| --- | --- | --- |
| OpenCV LAB 高/低频 | ~10–40ms | 270×480 |
| 高/低频 Skia 纹理 | ~20–30ms | 同上 |
| 布局扫描 + 踢脚线 + pick 表 | ~90–120ms | 405×720（1080p → longSide 720） |
| 全轮廓路径（异步，非阻塞） | ~80–150ms | 270×480 |

## 分辨率与 pipelineConfig

计算密集型步骤受 **最大长边限制** 约束，**不随 4K/8K 原图线性增长**。**完整 PNG 解码**仍随像素数线性增长。

| 步骤 | 配置键 | 1080×1920 实际尺寸 | 随原图像素数增长 |
| --- | --- | --- | --- |
| PNG 解码 | — | 1080×1920 × 2 张图片 | **是** |
| 遮罩分割 / pickMap | `maxImageLongSide: 720` | ~405×720 | **否**（长边 >720 时固定） |
| Shader 高/低频 | `paintFreqMaxLongSide: 480` | ~270×480 | **否** |
| 工作区 Skia 原图 | 同 `maxImageLongSide` | ~405×720 | **否** |
| 虚线轮廓 | `maskPathMaxLongSide: 480` | ~270×480 | **否**（不阻塞 `interactive`） |

## interactive 预估（默认 Pipeline）

| 原始图像规格 | 相对于 1080p 像素 | PNG 预热后 | 冷启动（无预热） |
| --- | --- | --- | --- |
| 1080×1920 | 1× | **320–450ms** | **450–700ms** |
| 1440×2560（2K） | ~1.8× | **400–550ms** | **600–900ms** |
| 3840×2160（4K） | ~4× | **500–750ms** | **800–1200ms** |
| 7680×4320（8K） | ~16× | **0.8–1.5s** | **1.5–3s+** |

> **`<300ms` interactive**：1080p + 预热 + 默认 pipeline + 高端设备上可达，但属 **乐观估计** — 不应视为全设备 SLA。

## 设备等级（1080p，默认 Pipeline）

相对于约 320ms 的开发环境基线：

| 等级 | 相对倍数 | 预热后 `interactive` | 冷启动 |
| --- | --- | --- | --- |
| 旗舰 iOS / 新款旗舰 Android | 0.8–1.2× | 300–450ms | 500–800ms |
| 中端 Android | 1.5–2.5× | 500–800ms | 700ms–1.2s |
| 低端 Android（4GB，旧 SoC） | 2.5–4× | 800ms–1.3s | 1–2s+ |

Android 额外开销主要来自：JS ↔ OpenCV 桥接、内存带宽/GC、Skia 纹理上传。

## 提高 maxImageLongSide 的影响

将 `pipelineConfig.maxImageLongSide` 设为 **1280**（高于默认 720）会使分割工作区变为约 720×1280，像素数约为 720 档的 **3 倍**：

| 场景 | 默认 720 | 提高到 1280 |
| --- | --- | --- |
| 1080p `interactive`（中端设备） | ~320–800ms | **500ms–1s+** |
| 分割 / pickMap 耗时 | ~90–120ms | ~250–350ms |

更高精度带来更长的初始化时间。要保持在 **`<500ms` interactive**，保留默认 **720**；必要时可降至 **640**。

## 优化建议

1. 🚀 **PNG 预热（推荐）**：在下载/提取图片后、导航到上色界面前调用 `prewarmPngBgrCacheAsync`。通常可节省 **100–250ms**（低端设备收益最大）。

```tsx
import { prewarmPngBgrCacheAsync } from 'react-native-mask-segment-canvas';

await prewarmPngBgrCacheAsync([originPath, maskPath]);
// 然后挂载 MaskSegmentCanvas
```

2. ⏱️ **加载时机**：在 `interactive` 时关闭阻塞加载器；可选监听 `mask_paths_ready` 以显示"轮廓准备中"提示。
3. 🖼️ **大图 / 低端设备**：保持默认 `maxImageLongSide: 720`；可选将 `paintFreqMaxLongSide` 降至 **360**。
4. 📷 **4K 素材**：在宿主侧先降采样再传入，或接受约 0.8–1.5s 的 `interactive`（含预热）。
5. 🔍 **可观测性**：观察 Metro 日志中的 `[MaskSegment]`、`[⏱ ...]` 前缀和 `onWatch` `durationMs`。
