---
id: basic-usage
title: 基本用法
---

# 💡 基本用法

## 🧑‍💻 最小示例

一个可直接复制粘贴的完整示例，涵盖 **PNG 预热**、**状态管理**、**配置**、**加载状态**、**onWatch** 和 **ref 操作**。

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import MaskSegmentCanvas, {
  type MaskSegmentCanvasRef,
  type MaskSegmentSession,
  type MaskSegmentWatchState,
  type BgrColor,
  MASK_SEMANTIC_COLORS,
  prewarmPngBgrCacheAsync,
} from 'react-native-mask-segment-canvas';

/** 由宿主应用准备的图像路径（本地 file:// 或 http(s)://） */
type ImagePaths = {
  origin: string;
  mask: string;
};

const INTERACTIVE_STATES: MaskSegmentWatchState[] = [
  'interactive',
  'mask_paths_ready',
];

export function PaintScreen() {
  const canvasRef = useRef<MaskSegmentCanvasRef>(null);

  const [imagePaths, setImagePaths] = useState<ImagePaths | null>(null);
  const [pathsError, setPathsError] = useState('');
  const [watchState, setWatchState] = useState<MaskSegmentWatchState | ''>('');
  const [errorMessage, setErrorMessage] = useState('');
  const [sessionDraft] = useState<MaskSegmentSession | null>(null);

  const isInteractive = INTERACTIVE_STATES.includes(
    watchState as MaskSegmentWatchState,
  );
  const isOutlineReady = watchState === 'mask_paths_ready';
  const isCanvasLoading =
    imagePaths != null &&
    watchState !== '' &&
    !INTERACTIVE_STATES.includes(watchState as MaskSegmentWatchState) &&
    watchState !== 'error';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const origin = 'file:///path/to/origin.png';
        const mask = 'file:///path/to/mask.png';
        await prewarmPngBgrCacheAsync([origin, mask]);
        if (!cancelled) {
          setImagePaths({ origin, mask });
        }
      } catch (e) {
        if (!cancelled) {
          setPathsError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    if (!isInteractive) return;
    const result = await canvasRef.current?.save({ destDir: undefined });
    console.log('saved', result?.filePath, result?.paintedCount);
  };

  if (pathsError) {
    return <Text>{pathsError}</Text>;
  }

  if (!imagePaths) {
    return (
      <View>
        <ActivityIndicator />
        <Text>Waiting for origin and mask images...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {isCanvasLoading ? <Text>Loading: {watchState}</Text> : null}
      {watchState === 'interactive' ? (
        <Text>Paintable (outlines loading...)</Text>
      ) : null}
      {isOutlineReady ? <Text>Ready</Text> : null}
      {errorMessage ? <Text>{errorMessage}</Text> : null}

      <MaskSegmentCanvas
        ref={canvasRef}
        style={{ flex: 1 }}
        originUrl={imagePaths.origin}
        maskUrl={imagePaths.mask}
        semanticColors={MASK_SEMANTIC_COLORS}
        regionOutlineColor="rgba(20, 120, 235, 0.58)"
        maskConfig={{ blackThreshold: 30, maxRegionColors: 6 }}
        pipelineConfig={{ maxImageLongSide: 720 }}
        paintConfig={{ colorBaseOpacity: 0.88 }}
        interactionConfig={{
          initRegionFlashMs: 1000,
          enableInitRegionFlash: true,
        }}
        initialSession={sessionDraft ?? undefined}
        showDebugPickers={false}
        showToolbar={false}
        showColorBar
        showStatusRow={false}
        showOverlayButtons
        disabled={!isInteractive}
        onWatch={(state, durationMs, detail) => {
          setWatchState(state);
          console.log('[onWatch]', state, durationMs, detail);
        }}
        onPaintCallback={payload => {
          if (payload.kind === 'brush_required') {
            toast(payload.hint);
            return;
          }
          console.log('painted', payload.regionId, payload.regionName, payload.color, payload.configJson);
        }}
        onError={message => {
          setErrorMessage(message);
          setWatchState('error');
        }}
      />
    </View>
  );
}
```

---

## 📊 状态变量

| 状态 | 类型 | 用途 |
| --- | --- | --- |
| `imagePaths` | `{ origin, mask } \| null` | 宿主解析后的本地/远程图片路径 |
| `pathsError` | `string` | 路径解析或 PNG 预热失败时的错误信息 |
| `watchState` | `MaskSegmentWatchState \| ''` | `onWatch` 上报的初始化阶段 |
| `isInteractive` | 派生值 | `interactive` 或 `mask_paths_ready` 时为 `true` — 允许操作 |
| `isOutlineReady` | 派生值 | `mask_paths_ready` 时为 `true` — 轮播虚线轮廓已就绪 |
| `isCanvasLoading` | 派生值 | Canvas 初始化阻塞中（不包括等待 PNG 路径） |
| `errorMessage` | `string` | `onError` 写入的分割/加载失败信息 |
| `sessionDraft` | `MaskSegmentSession \| null` | 从 MMKV 或类似存储恢复的草稿 |

---

## ⚙️ 选择配置值

| 配置 | 使用顶层 prop 的场景 | 使用嵌套 Config 的场景 |
| --- | --- | --- |
| 语义颜色 | `semanticColors={...}` 多数情况使用 | `maskConfig.semanticColors` 与其他遮罩参数配合使用时 |
| 轮廓颜色 | `regionOutlineColor="..."` 多数情况使用 | `paintConfig.regionOverlayFill` 同时自定义画笔调色板时 |
| 黑色阈值、最大区域数 | — | `maskConfig` |
| 图像处理尺寸 | — | `pipelineConfig` |
| 闪烁间隔、点击容差 | — | `interactionConfig` |

顶层 props 和嵌套 Configs **可以共存**；顶层 `semanticColors` / `regionOutlineColor` 优先级更高。

---

## 🔄 watchState 与 UI 引导

```ts
// 阻塞加载（区域和上色层就绪之前）
const isLoading = ![
  'interactive',
  'mask_paths_ready',
  'error',
  '',
].includes(watchState);

// 允许点击区域、选择颜色、上色（无需等待轮廓路径）
const canOperate =
  watchState === 'interactive' || watchState === 'mask_paths_ready';

// 轮播虚线轮廓已完全就绪（可选 — 可关闭"轮廓准备中"提示）
const isOutlineReady = watchState === 'mask_paths_ready';

// 显示错误界面
const hasError = watchState === 'error';
```

`interactive` 状态下，`detail.maskPathsReady` 通常为 `false`；`mask_paths_ready` 状态下为 `true`。间隔约 100ms（异步 Skia 路径构建），不阻塞点击上色。

`originUrl` / `maskUrl` 支持：

- 本地路径：`file:///...` 或绝对路径
- 远程 URL：`http(s)://...`（组件内部处理下载和解码）

> 旧版 props `originImgPath` / `maskImgPath` 已弃用；请使用 `originUrl` / `maskUrl`。
