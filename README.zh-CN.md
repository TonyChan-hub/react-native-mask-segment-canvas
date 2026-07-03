[**🇬🇧 English**](README.md)

---

# 🎨 react-native-mask-segment-canvas

一个 React Native **0.79** 交互式遮罩分割库。核心导出为 `MaskSegmentCanvas` 组件，可通过 **npm 包** 或 **npm link** 在任何 React Native 项目中使用。

- 🧠 **OpenCV** (`react-native-fast-opencv`)：遮罩语义布局、踢脚线修补、区域提取
- 🖌️ **Skia RuntimeEffect (SkSL)**：单 Pass 全屏着色器，混合原图 + LAB 低频/高频纹理颜色叠加
- ✂️ **Skia Path**：区域虚线轮廓高亮
- 👆 **交互**：底部颜色条选择画笔（可选初始化）→ 点击区域上色；未选择画笔时点击会触发 `onPaintCallback` 并附带提示；未选画笔时长按可预览区域的虚线轮廓

本仓库同时作为 **库源码**（`src/index.ts`）和 **自测 Demo**（根目录 `App.tsx`）。

📌 **推荐的集成 Demo 请查看 `example/` 目录** — 该目录仅使用公开 API，完全模拟消费方项目的集成方式（包括 `package.json`、Metro 配置和完整的参考 `App.tsx`）。

---

## 目录

- [概述](#概述)
- [环境要求](#环境要求)
- [安装](#安装)
  - [Peer 依赖](#peer-依赖)
  - [安装后设置](#安装后设置)
  - [iOS / Android 原生依赖](#ios--android-原生依赖)
  - [Metro 配置](#metro-配置)
  - [故障排除：重复模块错误](#故障排除重复模块错误)
- [快速开始（开发 Demo）](#快速开始开发-demo)
- [基本用法](#基本用法)
  - [最小示例](#最小示例)
  - [状态变量](#状态变量)
  - [选择配置值](#选择配置值)
  - [watchState 与 UI 引导](#watchstate-与-ui-引导)
- [API 参考](#api-参考)
  - [导入](#导入)
  - [Props：图像与初始化](#props图像与初始化)
  - [Props：语义颜色与轮廓](#props语义颜色与轮廓)
  - [Props：maskConfig](#propsmaskconfig)
  - [Props：pipelineConfig](#propspipelineconfig)
  - [Props：paintConfig](#propspaintconfig)
  - [Props：interactionConfig](#propsinteractionconfig)
  - [Props：UI 控件与样式](#propsui-控件与样式)
  - [Props：回调](#props回调)
  - [Ref 方法](#ref-方法)
  - [存储约定](#存储约定)
- [交互指南](#交互指南)
- [集成示例](#集成示例)
  - [PNG 缓存预热（推荐）](#png-缓存预热推荐)
  - [从 API 传入本地路径](#从-api-传入本地路径)
  - [草稿恢复](#草稿恢复)
  - [自定义语义颜色表](#自定义语义颜色表)
- [项目结构](#项目结构)
- [依赖项](#依赖项)
- [性能](#性能)
  - [实测参考（开发环境 + PNG 预热）](#实测参考开发环境--png-预热)
  - [分辨率与 pipelineConfig](#分辨率与-pipelineconfig)
  - [interactive 预估（默认 Pipeline）](#interactive-预估默认-pipeline)
  - [设备等级（1080p，默认 Pipeline）](#设备等级1080p默认-pipeline)
  - [提高 maxImageLongSide 的影响](#提高-maximagelongside-的影响)
  - [优化建议](#优化建议)
- [注意事项](#注意事项)
- [故障排除](#故障排除)

---

<a id="概述"></a>

## 🔭 概述

`MaskSegmentCanvas` 渲染原始图像并叠加语义遮罩，允许用户点击区域并应用颜色。处理流程：

1. 📥 **加载**原始图像和遮罩图像（本地 `file://` 或远程 `http(s)://`）
2. 🧩 **分割**通过 OpenCV 将遮罩分割为语义区域（墙面、天花板、踢脚线等）
3. 🎨 **准备**通过 SkSL 生成 LAB 频域层纹理，实现逼真的颜色混合
4. 📐 **构建**每个区域的 Skia 虚线轮廓路径
5. 👆 **交互** — 用户选择画笔颜色并点击区域上色；上色层保留底层纹理
6. 💾 **保存**合成结果为 PNG；导出 JSON 会话用于草稿恢复

组件通过 `onWatch` 发出 Pipeline 状态转换，宿主应用可据此显示相应的加载状态。

---

<a id="环境要求"></a>

## 📋 环境要求

- 🟢 Node.js >= 18（推荐 20+）
- 🍎 Xcode 15+（iOS）
- 🤖 Android Studio + JDK 17（Android）
- 📦 CocoaPods（iOS）

---

<a id="安装"></a>

## 📦 安装

<a id="peer-依赖"></a>

### 📦 Peer 依赖

在宿主项目中安装以下依赖（版本应与宿主 RN 版本匹配）：

```bash
npm install @shopify/react-native-skia react-native-reanimated react-native-fast-opencv react-native-fs buffer upng-js
# 如果使用 showDebugPickers（相册选择器）
npm install react-native-image-picker
```

<a id="安装后设置"></a>

### 🛠️ 安装后设置

本库依赖 `patch-package` 来修补 `react-native-fast-opencv`。宿主项目的 `package.json` 必须包含：

```json
{
  "scripts": {
    "postinstall": "patch-package"
  },
  "devDependencies": {
    "patch-package": "^8.0.1"
  }
}
```

安装本库后，`node_modules/react-native-mask-segment-canvas/patches/` 中的补丁将在宿主 `postinstall` 期间自动应用。

<a id="ios--android-原生依赖"></a>

### 📱 iOS / Android 原生依赖

```bash
cd ios && pod install && cd ..
```

确保宿主项目已按照各库文档完成 Skia、Reanimated 和 OpenCV 的原生设置。

<a id="metro-配置"></a>

### 🚇 Metro 配置

使用 `npm link`、monorepo 或 `file:` 依赖时，请将本库添加到 `watchFolders`，并使用 `extraNodeModules` + `blockList` 防止重复模块解析：

```js
const path = require('path');

module.exports = {
  watchFolders: [path.resolve(__dirname, '../MaskSegmentApp')],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    extraNodeModules: {
      'react-native-reanimated': path.resolve(__dirname, 'node_modules/react-native-reanimated'),
      '@shopify/react-native-skia': path.resolve(__dirname, 'node_modules/@shopify/react-native-skia'),
      'react-native-gesture-handler': path.resolve(__dirname, 'node_modules/react-native-gesture-handler'),
      'react-native-fast-opencv': path.resolve(__dirname, 'node_modules/react-native-fast-opencv'),
      'react-native-safe-area-context': path.resolve(__dirname, 'node_modules/react-native-safe-area-context'),
      'react-native-fs': path.resolve(__dirname, 'node_modules/react-native-fs'),
    },
    blockList: [
      /\/MaskSegmentApp\/node_modules\/@shopify\/react-native-skia\//,
      /\/MaskSegmentApp\/node_modules\/react-native-reanimated\//,
      /\/MaskSegmentApp\/node_modules\/react-native-fast-opencv\//,
      /\/MaskSegmentApp\/node_modules\/react-native-gesture-handler\//,
      /\/MaskSegmentApp\/node_modules\/react-native-safe-area-context\//,
      /\/MaskSegmentApp\/node_modules\/react-native-fs\//,
    ],
  },
};
```

**强烈推荐** — 在宿主 `index.js` 最顶部（任何业务代码之前）添加：

```js
import '@shopify/react-native-skia';
```

完整的配置（含所有 peer singleton 包）请参考 `example/metro.config.js` 和 `example/index.js`。

<a id="故障排除重复模块错误"></a>

### ⚠️ 故障排除：重复模块错误

常见症状：

- `SkiaPictureView must be a function (received 'undefined')`
- `createAnimatedNode: Animated node[...] already exists`

这些问题几乎都是由于 Metro 解析了多份 reanimated / skia / gesture-handler / fast-opencv / safe-area 包副本导致的。

**最佳实践：**

1. 从 `example/metro.config.js` 复制 `singletonPackages` + `extraNodeModules` + `blockList` 模式
2. 在 `index.js` 顶部按顺序导入 gesture-handler → reanimated → skia
3. 使用 `--reset-cache` 重启 Metro 并重新安装应用

详细清单和模板请参阅 `example/README.md`。

---

<a id="快速开始开发-demo"></a>

## 🚀 快速开始（开发 Demo）

根目录 `App.tsx` 是一个完整的自测 Demo，直接从 `./src` 导入。

```bash
cd MaskSegmentApp

npm install

cd ios && bundle exec pod install && cd ..

npm start

# 在另一个终端中
npm run ios
# 或
npm run android
```

**查看消费方项目如何集成：** 进入 `example/` 目录并按照其中的 `README.md` 操作。它使用 `import from 'react-native-mask-segment-canvas'` 配合标准 `package.json` 和 Metro 配置，完全模拟消费方环境。

---

<a id="基本用法"></a>

## 💡 基本用法

<a id="最小示例"></a>

### 🧑‍💻 最小示例

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

  // 示例：下载图片，然后预热 PNG 解码缓存
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

    return () => {
      cancelled = true;
    };
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

<a id="状态变量"></a>

### 📊 状态变量


| 状态               | 类型                          | 用途                                                       |
| ----------------- | ---------------------------- | ---------------------------------------------------------- |
| `imagePaths`      | `{ origin, mask } \| null`   | 宿主解析后的本地/远程图片路径                                   |
| `pathsError`      | `string`                     | 路径解析或 PNG 预热失败时的错误信息                               |
| `watchState`      | `MaskSegmentWatchState \| ''` | `onWatch` 上报的初始化阶段                                     |
| `isInteractive`   | 派生值                          | `interactive` 或 `mask_paths_ready` 时为 `true` — 允许操作      |
| `isOutlineReady`  | 派生值                          | `mask_paths_ready` 时为 `true` — 轮播虚线轮廓已就绪            |
| `isCanvasLoading` | 派生值                          | Canvas 初始化阻塞中（不包括等待 PNG 路径）                         |
| `errorMessage`    | `string`                      | `onError` 写入的分割/加载失败信息                               |
| `sessionDraft`    | `MaskSegmentSession \| null`  | 从 MMKV 或类似存储恢复的草稿                                     |


<a id="选择配置值"></a>

### ⚙️ 选择配置值


| 配置                      | 使用顶层 prop 的场景                    | 使用嵌套 Config 的场景                                                 |
| ------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| 语义颜色                    | `semanticColors={...}` 多数情况使用       | `maskConfig.semanticColors` 与其他遮罩参数配合使用时                      |
| 轮廓颜色                    | `regionOutlineColor="..."` 多数情况使用   | `paintConfig.regionOverlayFill` 同时自定义画笔调色板时                    |
| 黑色阈值、最大区域数            | —                                      | `maskConfig`                                                          |
| 图像处理尺寸                  | —                                      | `pipelineConfig`                                                      |
| 闪烁间隔、点击容差             | —                                      | `interactionConfig`                                                   |


顶层 props 和嵌套 Configs **可以共存**；顶层 `semanticColors` / `regionOutlineColor` 优先级更高。

<a id="watchstate-与-ui-引导"></a>

### 🔄 watchState 与 UI 引导

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

---

<a id="api-参考"></a>

## 📖 API 参考

<a id="导入"></a>

### 📥 导入

```tsx
import MaskSegmentCanvas, {
  type MaskSegmentCanvasRef,
  type MaskSegmentCanvasProps,
  type MaskSegmentSession,
  type MaskSegmentWatchState,
  type MaskSegmentWatchDetail,
  type BgrColor,
  type MaskSemanticColor,
  type PaintCallbackPayload,
  type PaintedRegionRecord,
  type PipelineConfig,
  type MaskSegmentConfig,
  type PaintConfig,
  type InteractionConfig,
  type SavePaintResult,
  MASK_SEMANTIC_COLORS,
  BASEBOARD_SEMANTIC_NAME,
  prewarmPngBgrCacheAsync,
  DEFAULT_PIPELINE_CONFIG,
  DEFAULT_MASK_CONFIG,
  DEFAULT_PAINT_CONFIG,
  DEFAULT_INTERACTION_CONFIG,
} from 'react-native-mask-segment-canvas';
```


| 分类                     | 名称                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| 组件                      | `MaskSegmentCanvas`（默认导出）                                                              |
| Ref / Props 类型           | `MaskSegmentCanvasRef`, `MaskSegmentCanvasProps`                                         |
| 会话 / 回调类型             | `MaskSegmentSession`, `PaintCallbackPayload`, `PaintedRegionRecord`, `SavePaintResult`   |
| Watch 类型                 | `MaskSegmentWatchState`, `MaskSegmentWatchDetail`                                        |
| 配置类型                    | `PipelineConfig`, `MaskSegmentConfig`, `PaintConfig`, `InteractionConfig`                |
| 语义颜色                    | `MASK_SEMANTIC_COLORS`, `BASEBOARD_SEMANTIC_NAME`                                        |
| 工具函数                    | `prewarmPngBgrCacheAsync`                                                                |
| 运行时默认值                   | `DEFAULT_*_CONFIG`                                                                       |


<a id="props图像与初始化"></a>

### 🖼️ Props：图像与初始化


| Prop                     | 类型                        | 必填     | 默认值    | 描述                                                                                       |
| ------------------------ | --------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------ |
| `originUrl`              | `string`                   | 是*     | —        | 原始图像 URL（`file://`、绝对路径或 `http(s)://`）                                              |
| `maskUrl`                | `string`                   | 是*     | —        | 遮罩图像 URL（语义色块图；建议与原始图像尺寸相同）                                                     |
| `originImgPath`          | `string`                   | —       | —        | **已弃用** — 请使用 `originUrl`                                                               |
| `maskImgPath`            | `string`                   | —       | —        | **已弃用** — 请使用 `maskUrl`                                                                 |
| `initialSession`         | `MaskSegmentSession`       | 否       | —        | 从 MMKV 等恢复的草稿；区域就绪后自动调用 `loadSession`                                               |
| `initialPaintColor`      | `BgrColor`                 | 否       | —        | **可选**。初始自定义画笔颜色 `{ b, g, r }`；省略时默认不选中画笔；用户需选择颜色或调用 `ref.setPaintColor`       |
| `initialPaintConfigJson` | `Record<string, unknown>`  | 否       | —        | **可选**。`initialPaintColor` 的附带画笔配置；成功上色时通过 `onPaintCallback` 返回                        |


<a id="props语义颜色与轮廓"></a>

### 🎨 Props：语义颜色与轮廓


| Prop                 | 类型                    | 默认值                       | 描述                                                     |
| -------------------- | ----------------------- | -------------------------- | -------------------------------------------------------- |
| `semanticColors`     | `MaskSemanticColor[]`   | `MASK_SEMANTIC_COLORS`     | 遮罩语义识别颜色；等同于 `maskConfig.semanticColors`          |
| `regionOutlineColor` | `string`                | `rgba(20, 120, 235, 0.58)` | 区域虚线高亮颜色；等同于 `paintConfig.regionOverlayFill`       |


顶层 props 优先于嵌套的 `maskConfig` / `paintConfig`。

`MaskSemanticColor` 结构：

```ts
{
  name: string;   // 语义名称，如 wall / ceiling / baseboard
  hex: string;    // 显示用的十六进制颜色
  bgr: { b: number; g: number; r: number }; // 必须与遮罩像素 BGR 通道匹配
}
```

内置调色板：`MASK_SEMANTIC_COLORS`（详见 `src/utils/maskSemanticPalette.ts`）。

<a id="propsmaskconfig"></a>

### 🧩 Props：maskConfig


| 字段                            | 类型                   | 默认值                     | 描述                                        |
| ------------------------------- | ---------------------- | ------------------------- | ------------------------------------------- |
| `semanticColors`                | `MaskSemanticColor[]`  | 内置调色板                    | 遮罩语义颜色（可被顶层 `semanticColors` 覆盖）      |
| `blackThreshold`                | `number`               | `30`                      | max(B,G,R) 低于此值的像素视为黑色背景              |
| `maxRegionColors`               | `number`               | `6`                       | 保留的最大语义区域数                              |
| `quantStep`                     | `number`               | `64`                      | 踢脚线量化步长                                  |
| `baseboardMaxColorDist`         | `number`               | `42`                      | 踢脚线颜色距离阈值                               |
| `baseboardStripQuantKeys`       | `string[]`             | 内置键值                     | 踢脚线条带量化键，格式 `"b,g,r"`                  |
| `wallQuantKeys`                 | `string[]`             | 内置键值                     | 墙面量化键                                     |
| `cabinetQuantKeys`              | `string[]`             | 内置键值                     | 橱柜量化键                                     |
| `secondarySemanticNames`        | `string[]`             | `garageDoor, roof, eave`  | 次要语义名称                                    |
| `secondaryMinPixelRatio`        | `number`               | `0.002`                   | 次要语义的最小像素比例                             |
| `junctionHRadiusPx`             | `number`               | `24`                      | 踢脚线接缝水平半径                               |
| `junctionVRadiusPx`             | `number`               | `2`                       | 踢脚线接缝垂直半径                               |
| `kickBridgeHalfWPx`             | `number`               | `6`                       | 踢脚线水平间隙桥接半宽                            |
| `baseboardJunctionRowMarginPx`  | `number`               | `1`                       | 踢脚线接缝行边距                                |
| `baseboardJunctionVReachPx`     | `number`               | `2`                       | 踢脚线接缝垂直延伸                               |
| `baseboardMinRunPx`             | `number`               | `2`                       | 遮罩条带最小运行长度                              |
| `splitWalls`                    | `boolean`              | `false`                   | 将墙面遮罩按纹理边界拆分为 `wall-1`、`wall-2`...    |
| `splitWallsMaxCount`            | `number`               | `8`                       | 最大墙面子区域数                                 |
| `splitWallsMinAreaRatio`        | `number`               | `0.002`                   | 碎片最小面积比例（相对于总分割像素）                   |
| `splitWallsColorDistSq`         | `number`               | `1400`                    | 连通分量色度均值距离平方阈值                         |
| `splitWallsChromaBlurRadius`    | `number`               | `5`                       | 保留：色度平滑半径                                |
| `splitWallsNeutralChromaMax`    | `number`               | `14`                      | 白/灰墙面低色度半径；与彩色墙面的强制边界               |


启用 `splitWalls` 后，单个 `wall` 区域将被替换为多个 `wall-N` 子区域，每个子区域可独立上色和撤销。旧会话中 `regionName: 'wall'` 的记录无法映射到新的子区域名称，需重新上色。

<a id="propspipelineconfig"></a>

### 🔬 Props：pipelineConfig


| 字段                         | 类型     | 默认值    | 描述                                         |
| --------------------------- | -------- | -------- | -------------------------------------------- |
| `maxImageLongSide`          | `number` | `720`    | 分割 / pickMap / 工作区域缩放的最大长边            |
| `paintFreqMaxLongSide`      | `number` | `480`    | OpenCV LAB 频域层的最大长边                      |
| `originPreviewMaxLongSide`  | `number` | `360`    | 预览最大长边（主路径使用工作分辨率）                   |
| `maskPathMaxLongSide`       | `number` | `480`    | 轮廓路径下采样的最大长边                             |
| `minContourArea`            | `number` | `100`    | 最小轮廓面积（按分辨率比例缩放）                       |
| `contourApproxEpsilon`      | `number` | `0.003`  | 轮廓多边形近似系数                                  |
| `maxRegions`                | `number` | `500`    | 分割期间的最大区域数                                  |


<a id="propspaintconfig"></a>

### 🖌️ Props：paintConfig


| 字段                          | 类型          | 默认值                     | 描述                                                   |
| ----------------------------- | ------------ | ------------------------- | ------------------------------------------------------ |
| `palette`                     | `BgrColor[]` | 6色内置调色板                  | 底部画笔颜色条                                             |
| `colorBaseOpacity`            | `number`     | `0.88`                    | 基础颜色不透明度                                           |
| `lLightOpacity`               | `number`     | `0.50`                    | L 通道叠加强度                                            |
| `textureOpacity`              | `number`     | `0.85`                    | 高频纹理叠加强度（更强的纹理保留效果）                            |
| `lLowBlurKernel`              | `number`     | `7`                       | 低频高斯核（奇数）                                          |
| `lLowContrast`                | `number`     | `1.15`                    | 低频对比度                                                |
| `lLowBrightness`              | `number`     | `0.9`                     | 低频亮度                                                 |
| `lHighGain`                   | `number`     | `1.22`                    | 高频增益                                                 |
| `maskFeatherColor`            | `number`     | `1.6`                     | 上色边缘羽化（颜色）— 软边缘 alpha 半径，单位像素                    |
| `maskFeatherTexture`          | `number`     | `0.9`                     | 上色边缘羽化（纹理）— 保留/辅助                                  |
| `regionOverlayFill`           | `string`     | `rgba(20,120,235,0.58)`    | 虚线 / 高亮填充颜色                                          |
| `regionOutlineStrokeWidth`    | `number`     | `4`                       | 虚线轮廓描边宽度                                             |


<a id="propsinteractionconfig"></a>

### 👆 Props：interactionConfig


| 字段                      | 类型      | 默认值     | 描述                                                |
| ------------------------- | -------- | -------- | ---------------------------------------------------- |
| `pickMapSearchRadiusPx`   | `number` | `14`     | 点击 pickMap 搜索半径（像素）                              |
| `kickMaskPickRadiusPx`    | `number` | `36`     | 踢脚线遮罩拾取半径                                         |
| `thinStripPadding`        | `number` | `0.008`  | 细条（踢脚线）点击扩展比例                                    |
| `regionPadding`           | `number` | `0.003`  | 普通区域点击扩展比例                                        |
| `initRegionFlashMs`       | `number` | `1000`   | 初始轮播中每条虚线轮廓持续时长（ms）                              |
| `enableInitRegionFlash`   | `boolean`| `true`   | 启用初始轮播动画                                           |


> 完整默认常量：`DEFAULT_MASK_CONFIG`、`DEFAULT_PIPELINE_CONFIG`、`DEFAULT_PAINT_CONFIG`、`DEFAULT_INTERACTION_CONFIG`（从包入口导出）。

<a id="propsui-控件与样式"></a>

### 🎛️ Props：UI 控件与样式


| Prop                                             | 类型                     | 默认值                 | 描述                                               |
| ------------------------------------------------ | ----------------------- | --------------------- | -------------------------------------------------- |
| `showToolbar`                                    | `boolean`              | `true`                | 顶部工具栏（"清除缓存并重新分割"）                          |
| `showColorBar`                                   | `boolean`              | `true`                | 底部画笔颜色条                                           |
| `showStatusRow`                                  | `boolean`              | `true`                | 分割/加载状态文字                                          |
| `showOverlayButtons`                             | `boolean`              | `true`                | 左下撤销、右下对比按钮                                      |
| `showDebugPickers`                               | `boolean`              | `true`                | 相册调试选择器（生产环境设为 `false`）                         |
| `disabled`                                       | `boolean`              | `false`               | 禁用上色交互                                              |
| `style`                                          | `ViewStyle`            | —                     | 外层容器样式                                              |
| `canvasStyle`                                    | `ViewStyle`            | —                     | 画布区域样式                                              |
| `undoButtonStyle` / `compareButtonStyle`         | `ViewStyle`            | —                     | 覆盖按钮样式                                              |
| `undoButtonTextStyle` / `compareButtonTextStyle` | `TextStyle`            | —                     | 覆盖按钮文字样式                                           |
| `undoButtonText`                                 | `string`               | `Undo` (zh)          | 撤销按钮标签                                              |
| `compareButtonText`                              | `string`               | `Compare` (zh)       | 进入对比模式标签                                           |
| `compareExitButtonText`                          | `string`               | `Exit Compare` (zh)  | 退出对比模式标签                                           |
| `renderUndoButton`                               | `(props) => ReactNode` | —                     | 自定义撤销按钮渲染器                                        |
| `renderCompareButton`                            | `(props) => ReactNode` | —                     | 自定义对比按钮渲染器                                        |


<a id="props回调"></a>

### 📞 Props：回调


| Prop              | 签名                                       | 描述                                                       |
| ----------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `onWatch`         | `(state, durationMs, detail?) => void`     | 初始化阶段回调；`durationMs` 从本次 `init` 开始计时              |
| `onPaintCallback` | `(payload: PaintCallbackPayload) => void`  | 成功上色时触发，或未选择画笔时点击区域触发                          |
| `onError`         | `(message, error?) => void`               | 分割或加载失败                                                |


`PaintCallbackPayload`（可辨识联合类型，通过 `payload.kind` 区分）：

```ts
// 成功上色
{
  kind: 'painted';
  regionId: number;
  regionName: string;
  color: BgrColor;
  configJson?: Record<string, unknown>; // 来自 setPaintColor / initialPaintConfigJson
}

// 点击了有效区域但未选择画笔（未执行上色）
{
  kind: 'brush_required';
  hint: string;       // 如 "请先选择画笔颜色（底部颜色条或 ref.setPaintColor）"
  regionId: number;
  regionName: string;
}
```

示例：

```tsx
onPaintCallback={payload => {
  if (payload.kind === 'brush_required') {
    showToast(payload.hint);
    return;
  }
  savePaintRecord(payload.regionId, payload.color, payload.configJson);
}}
```

`onWatch` `detail`（`MaskSegmentWatchDetail`）：


| 字段                | 类型       | 描述                                   |
| ------------------ | --------- | -------------------------------------- |
| `regionCount`      | `number`  | 当前有效区域数                            |
| `maskPathsReady`   | `boolean` | 轮廓 Skia 路径是否就绪                    |
| `freqLayersReady`  | `boolean` | 频域 Shader 纹理是否就绪                  |
| `errorMessage`     | `string`  | `error` 状态下的失败描述                   |


#### onWatch 状态流转

```
init
  → images_loaded      原始图像和遮罩读取完成
  → mask_aligned       遮罩尺寸对齐
  → mask_sampled       遮罩像素采样完成
  → regions_ready      区域提取成功
  → layers_ready       上色纹理层就绪（detail.maskPathsReady 可能仍为 false）
  → interactive        可交互（可以点击区域、选择颜色、上色）
  → mask_paths_ready   轮廓路径就绪（轮播虚线轮廓可显示；detail.maskPathsReady 为 true）
  → error              失败（detail.errorMessage 包含描述）
```

`layers_ready` / `interactive` 可能在轮廓路径计算完成之前触发。如果宿主在 `interactive` 时关闭阻塞加载器，用户已可操作；轮播虚线轮廓在 `mask_paths_ready` 后自动显示。

<a id="ref-方法"></a>

### 🔧 Ref 方法

通过 `ref` 访问（类型 `MaskSegmentCanvasRef`）：


| 方法                   | 签名                                       | 描述                                                                              |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| `reset`               | `() => void`                               | 撤销上一步上色操作（按 `paintHistory`）                                                  |
| `swap`                | `(showOrigin?: boolean) => void`           | 切换原始图像对比；省略参数则切换，`true`/`false` 强制设置                                      |
| `save`                | `(options?) => Promise<SavePaintResult>`   | 合成并保存 PNG；`options.destDir` 可选输出目录                                           |
| `session`             | `() => MaskSegmentSession`                 | 导出 JSON 可序列化会话（用于 MMKV 存储）                                                   |
| `loadSession`         | `(session) => void`                        | 恢复上色状态（也可通过 `initialSession` 使用）                                              |
| `setPaintColor`       | `(color, configJson?) => void`             | 设置当前画笔颜色；清除底部颜色条选中状态                                                       |
| `setMaskConfig`       | `(config) => void`                         | 运行时更新遮罩配置并 **重新分割**                                                          |
| `clearAllPaint`       | `() => void`                               | 清除所有上色记录                                                                         |
| `resegment`           | `() => Promise<void>`                      | 清除 PNG 缓存并重新分割                                                                  |
| `getRegions`          | `() => SegmentRegion[]`                    | 当前区域列表快照                                                                         |
| `getPaintedRegions`   | `() => PaintedRegionRecord[]`              | 当前上色记录快照                                                                         |


`SavePaintResult`：`{ filePath, width, height, paintedCount, previewPath? }`

代码示例：

```tsx
const ref = useRef<MaskSegmentCanvasRef>(null);

ref.current?.reset();
ref.current?.swap();           // 切换
ref.current?.swap(true);       // 强制显示原始图像

const result = await ref.current?.save({ destDir: '/path/to/dir' });

const session = ref.current?.session();
ref.current?.loadSession(session);

ref.current?.setPaintColor({ b: 100, g: 120, r: 140 }, { sku: 'paint-001' });
ref.current?.setMaskConfig({ semanticColors: customColors });

ref.current?.clearAllPaint();
await ref.current?.resegment();

const regions = ref.current?.getRegions();
const painted = ref.current?.getPaintedRegions();
```

> `save` 依赖于工作缓冲区和 pickMap 就绪（通常在 `interactive` 之后）；如果未就绪则抛出 `'Image not ready, cannot save'`。

<a id="存储约定"></a>

### 💾 存储约定


| 能力               | 推荐存储                 | 内容                                                    |
| ----------------- | ----------------------- | ------------------------------------------------------- |
| `ref.save()`      | 文件系统                   | 全分辨率 PNG 路径                                          |
| `ref.session()`   | MMKV / AsyncStorage     | JSON 元数据（URL、上色记录、画笔颜色等）                          |


`MaskSegmentSession` 结构：

```ts
{
  version: 1;
  originUrl: string;
  maskUrl: string;
  painted: PaintedRegionRecord[];  // { regionId, regionName, color, configJson? }
  paintHistory: number[];
  currentColor?: BgrColor;
  currentColorConfigJson?: Record<string, unknown>;
  savedAt: number;
}
```

---

<a id="交互指南"></a>

## 🎮 交互指南

1. 🔁 **初始轮播**：区域就绪后，每个区域的虚线轮廓按 `initRegionFlashMs`（默认 1s）依次闪烁；首次用户触摸时停止。
2. 🔍 **预览（未选择画笔）**：长按区域可显示触摸点下连通分量的虚线轮廓；点击黑色区域不显示轮廓。
3. 🎨 **上色（已选择画笔）**：点击底部颜色条中的颜色或调用 `ref.setPaintColor`（或通过 `initialPaintColor` 预设），然后点击区域上色；再次点击同一区域会覆盖颜色。
4. 💬 **无画笔点击**：不执行上色；`onPaintCallback` 触发 `kind: 'brush_required'`，携带提示信息和目标区域信息，供宿主显示 Toast/弹窗提示选择颜色。
5. ↩️ **撤销**：左下按钮或 `ref.reset()`；按上色历史逐步后退。
6. 👁️ **与原图对比**：右下按钮或 `ref.swap()`；隐藏上色层以显示原图。

---

<a id="集成示例"></a>

## 🧩 集成示例

<a id="png-缓存预热推荐"></a>

### 🔥 PNG 缓存预热（推荐）

```tsx
import { prewarmPngBgrCacheAsync } from 'react-native-mask-segment-canvas';

async function openPaintScreen(originUrl: string, maskUrl: string) {
  await prewarmPngBgrCacheAsync([originUrl, maskUrl]);
  navigation.navigate('Paint', { originUrl, maskUrl });
}
```

<a id="从-api-传入本地路径"></a>

### 🌐 从 API 传入本地路径

```tsx
<MaskSegmentCanvas
  originUrl={localOriginPath}
  maskUrl={localMaskPath}
  showDebugPickers={false}
  showToolbar={false}
  semanticColors={MASK_SEMANTIC_COLORS}
  regionOutlineColor="#1e96ff"
  onWatch={(state, ms, detail) => {
    if (state === 'interactive') hideBlockingLoader();
    if (state === 'mask_paths_ready') hideOutlineHint();
  }}
/>
```

<a id="草稿恢复"></a>

### 💾 草稿恢复

```tsx
const draft = JSON.parse(mmkv.getString('paint_draft'));

<MaskSegmentCanvas
  originUrl={draft.originUrl}
  maskUrl={draft.maskUrl}
  initialSession={draft}
/>
```

<a id="自定义语义颜色表"></a>

### 🎨 自定义语义颜色表

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

---

<a id="项目结构"></a>

## 📁 项目结构

```
MaskSegmentApp/                              # 仓库根目录（npm 包 react-native-mask-segment-canvas）
├── App.tsx                                  # 开发自测 Demo（直接从 ./src 导入）
├── src/
│   ├── index.ts                             # 包入口（消费方：import 'react-native-mask-segment-canvas'）
│   ├── components/
│   │   ├── MaskSegmentCanvas.tsx
│   │   └── MaskSegmentCanvas.types.ts
│   └── utils/
│       ├── maskSegmentation.ts
│       ├── maskSegmentRuntime.ts
│       ├── maskSemanticPalette.ts
│       └── ...
├── example/                                 # ★ 推荐：消费方集成 Demo
│   ├── App.tsx                              # 仅使用公开 API 的完整示例
│   ├── index.js / app.json
│   ├── package.json                         # 所需依赖 + "react-native-mask-segment-canvas": "file:.."
│   ├── metro.config.js / babel.config.js / tsconfig.json
│   └── README.md                            # 如何在真实项目中集成
├── patches/                                 # 随包发布；由宿主 postinstall 应用
├── ios/                                     # 根 Demo 原生项目（不发布到 npm）
└── android/
```

---

<a id="依赖项"></a>

## 📚 依赖项


| 包                                | 用途                                                       |
| -------------------------------- | --------------------------------------------------------- |
| `@shopify/react-native-skia`     | Canvas 渲染、Path、虚线描边、Blend 合成                        |
| `react-native-fast-opencv`       | 遮罩形态学、轮廓处理                                            |
| `react-native-fs`                | 图层缓存、PNG 保存                                            |
| `react-native-image-picker`      | Demo 相册选择器                                              |
| `react-native-reanimated`        | Skia 动画依赖                                                |
| `react-native-safe-area-context` | 安全区域边距                                                   |


---

<a id="性能"></a>

## ⚡ 性能

以下数据基于 Demo 测试图片（`assets/test/origin.png` **1080×1920**，6 个语义区域）、**默认 `pipelineConfig`** 和 `onWatch` `durationMs`（从 `init` 开始测量）。这些是 **经验范围数据**，非严格基准测试；实际设备结果因 CPU、存储和 RN 版本而异。

<a id="实测参考开发环境--png-预热"></a>

### 📏 实测参考（开发环境 + PNG 预热）

Demo 在挂载 Canvas 前调用 `prewarmPngBgrCacheAsync([origin, mask])`，因此 PNG 解码命中内存缓存。典型日志：


| 阶段               | watchState                       | 大约耗时            | 备注                                                        |
| ----------------- | -------------------------------- | ----------------- | ----------------------------------------------------------- |
| 遮罩对齐            | `mask_aligned`                   | ~160ms            | 遮罩缩放至分割工作分辨率                                          |
| 区域就绪            | `regions_ready` / `mask_sampled` | ~320ms            | 布局扫描 + 踢脚线 + pickMap                                    |
| **可交互**          | `**interactive`**                | **~320–450ms**    | 可点击区域、选择颜色、Shader 上色                                 |
| 轮廓就绪            | `mask_paths_ready`               | ~430–550ms        | `interactive` 后约 100ms；轮播轮廓可显示                         |


`interactive` **不等待**轮廓路径；`mask_paths_ready` 仅影响初始轮播和可选的 UI 提示。

同图子步骤耗时大小（`__DEV__` 日志，默认 pipeline）：


| 子步骤                                     | 大约耗时           | 工作分辨率                       |
| ----------------------------------------- | ---------------- | ------------------------------ |
| OpenCV LAB 高/低频                          | ~10–40ms         | 270×480                        |
| 高/低频 Skia 纹理                           | ~20–30ms         | 同上                             |
| 布局扫描 + 踢脚线 + pick 表                   | ~90–120ms        | 405×720（1080p → longSide 720） |
| 全轮廓路径（异步，非阻塞）                       | ~80–150ms        | 270×480                        |


<a id="分辨率与-pipelineconfig"></a>

### 📐 分辨率与 pipelineConfig

计算密集型步骤受 **最大长边限制** 约束，**不随 4K/8K 原图线性增长**。**完整 PNG 解码**仍随像素数线性增长。


| 步骤                       | 配置键                       | 1080×1920 实际尺寸       | 随原图像素数增长            |
| -------------------------- | --------------------------- | ---------------------- | ----------------------- |
| PNG 解码                    | —                           | 1080×1920 × 2 张图片     | **是**                  |
| 遮罩分割 / pickMap           | `maxImageLongSide: 720`     | ~405×720               | **否**（长边 >720 时固定） |
| Shader 高/低频              | `paintFreqMaxLongSide: 480` | ~270×480               | **否**                  |
| 工作区 Skia 原图             | 同 `maxImageLongSide`       | ~405×720               | **否**                  |
| 虚线轮廓                     | `maskPathMaxLongSide: 480`  | ~270×480               | **否**（不阻塞 `interactive`） |


<a id="interactive-预估默认-pipeline"></a>

### ⏱️ interactive 预估（默认 Pipeline）


| 原始图像规格       | 相对于 1080p 像素 | PNG 预热后          | 冷启动（无预热）          |
| --------------- | ---------------- | ----------------- | ---------------------- |
| 1080×1920       | 1×               | **320–450ms**     | **450–700ms**          |
| 1440×2560（2K）   | ~1.8×            | **400–550ms**     | **600–900ms**          |
| 3840×2160（4K）   | ~4×              | **500–750ms**     | **800–1200ms**         |
| 7680×4320（8K）   | ~16×             | **0.8–1.5s**      | **1.5–3s+**            |


> **<300ms interactive**：1080p + 预热 + 默认 pipeline + 高端设备上可达，但属 **乐观估计** — 不应视为全设备 SLA。

<a id="设备等级1080p默认-pipeline"></a>

### 📱 设备等级（1080p，默认 Pipeline）

相对于约 320ms 的开发环境基线：


| 等级                                | 相对倍数       | 预热后 `interactive`    | 冷启动           |
| ---------------------------------- | ------------ | ---------------------- | ---------------- |
| 旗舰 iOS / 新款旗舰 Android          | 0.8–1.2×     | 300–450ms              | 500–800ms        |
| 中端 Android                        | 1.5–2.5×     | 500–800ms              | 700ms–1.2s       |
| 低端 Android（4GB，旧 SoC）           | 2.5–4×       | 800ms–1.3s             | 1–2s+            |


Android 额外开销主要来自：JS ↔ OpenCV 桥接、内存带宽/GC、Skia 纹理上传。

<a id="提高-maximagelongside-的影响"></a>

### 📈 提高 maxImageLongSide 的影响

将 `pipelineConfig.maxImageLongSide` 设为 **1280**（高于默认 720）会使分割工作区变为约 720×1280，像素数约为 720 档的 **3 倍**：


| 场景                             | 默认 720         | 提高到 1280           |
| ------------------------------- | --------------- | --------------------- |
| 1080p `interactive`（中端设备）    | ~320–800ms      | **500ms–1s+**         |
| 分割 / pickMap 耗时              | ~90–120ms       | ~250–350ms            |


更高精度带来更长的初始化时间。要保持在 **<500ms interactive**，保留默认 **720**；必要时可降至 **640**。

<a id="优化建议"></a>

### 💨 优化建议

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

---

<a id="注意事项"></a>

## 📝 注意事项

- 遮罩图像应为与原始图像同尺寸的语义色块图（黑色背景 + 纯色区域）。`max(B,G,R) < blackThreshold`（默认 30）的像素将被排除在分割之外。
- OpenCV 分割在 JS 线程上运行；非常大的图像可能导致掉帧。使用 `pipelineConfig.maxImageLongSide` 限制处理分辨率。
- iOS 相册访问需要照片权限（仅在启用 `showDebugPickers` 时需要）。
- `semanticColors` 必须与后端/标注遮罩中使用的语义颜色匹配；不匹配会导致识别偏差。

---

<a id="故障排除"></a>

## 🔧 故障排除

**iOS pod install 失败**

```bash
cd ios
bundle install
bundle exec pod install --repo-update
```

**Android 构建错误**

```bash
cd android && ./gradlew clean && cd ..
```

**分割失败 / 零区域**

- 确认 `originUrl` / `maskUrl` 可访问
- 确认遮罩语义颜色与 `semanticColors` 配置匹配
- 检查 Metro 日志中的 `[MaskSegment]` / `[⏱ ...]` 输出

**虚线轮廓错位 / 多余轮廓**

- 轮廓从遮罩像素外部轮廓生成；长按仅显示触摸点下的连通分量
- 初始轮播仅显示每个语义区域的最大连通分量
