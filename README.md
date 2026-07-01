# react-native-mask-segment-canvas

基于 React Native **0.79** 的掩码分区交互库，核心导出 `MaskSegmentCanvas` 组件，可通过 **npm 包** 或 **npm link** 接入其它 RN 工程。

- **OpenCV**（`react-native-fast-opencv`）：掩码语义布局、踢脚线修补、分区提取
- **Skia RuntimeEffect（SkSL）**：原图 + LAB 高低频纹理叠色（单次全屏 Shader）
- **Skia Path**：分区虚线轮廓高亮
- **交互**：底部笔刷选色（可选初始化）→ 点击分区上色；未选笔刷时点击分区会通过 `onPaintCallback` 提示；未选笔刷时长按预览分区虚线轮廓

本仓库同时作为 **库源码**（`src/index.ts`）与 **自测 Demo**（根目录 `App.tsx`）维护。

**推荐的集成演示请查看 `example/` 目录**：它只使用公开 API，完整模拟业务项目接入方式（含 `package.json`、Metro 配置、完整可参考的 `App.tsx`）。

---

## 作为 npm 包接入其它工程

### 安装依赖（宿主工程）

```bash
npm install react-native-mask-segment-canvas
# 或本地联调
npm link ../MaskSegmentApp   # 在库目录先执行 npm link
npm link react-native-mask-segment-canvas
```

宿主工程还需安装 **peerDependencies**（版本需与宿主 RN 对齐）：

```bash
npm install @shopify/react-native-skia react-native-reanimated react-native-fast-opencv react-native-fs buffer upng-js
# 若使用 showDebugPickers 相册选图
npm install react-native-image-picker
```

### 宿主工程 postinstall（必需）

本库依赖 `patch-package` 修补 `react-native-fast-opencv`，宿主 `package.json` 需配置：

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

安装本库后，`node_modules/react-native-mask-segment-canvas/patches/` 中的补丁会在宿主 `postinstall` 时自动应用。

### iOS / Android 原生依赖

```bash
cd ios && pod install && cd ..
```

确保宿主已按各原生库文档完成 Skia、Reanimated、OpenCV 等配置。

### Metro 配置（npm link / monorepo / file: 依赖时）

联调时若出现模块解析问题，在宿主 `metro.config.js` 中把本库加入 `watchFolders`，并使用下面推荐的完整配置（同时包含 extraNodeModules + blockList）。这是防止所有「类似重复模块问题」（SkiaPictureView undefined、Reanimated Animated node already exists 等）的可靠做法：

```js
const path = require('path');

module.exports = {
  watchFolders: [path.resolve(__dirname, '../MaskSegmentApp')],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    // 推荐同时使用 extraNodeModules + blockList
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

**强烈建议**在宿主 `index.js` 最顶部加入（在任何业务代码之前）：

```js
import '@shopify/react-native-skia';
```

（完整推荐配置见下文「故障排查」以及 `example/metro.config.js` + `example/index.js`，那里有覆盖全部 peer 的 singletons 列表。）

### 故障排查：各种重复模块导致的运行时错误

常见症状（同类问题）：

- `SkiaPictureView must be a function (received 'undefined')`
- `createAnimatedNode: Animated node[...] already exists`

**几乎总是**因为 Metro 同时解析到多份 reanimated / skia / gesture-handler / fast-opencv / safe-area 等包。

**最佳实践**：

- 直接复制 `example/metro.config.js` 里的 `singletonPackages` + extraNodeModules + blockList 写法
- 在你的 `index.js` 最顶部加入 gesture-handler → reanimated → skia 三个 import
- 重启 Metro (`--reset-cache`) + 重装 app

详细清单和模板见 `example/README.md` 的「运行时出现类似错误」一节。
### 业务侧引入

```tsx
import MaskSegmentCanvas, {
  type MaskSegmentCanvasRef,
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

主要导出一览：


| 类别             | 名称                                                                                  |
| -------------- | ----------------------------------------------------------------------------------- |
| 组件             | `MaskSegmentCanvas`（default）                                                        |
| Ref / Props 类型 | `MaskSegmentCanvasRef`、`MaskSegmentCanvasProps`                                     |
| 会话 / 回调类型      | `MaskSegmentSession`、`PaintCallbackPayload`、`PaintedRegionRecord`、`SavePaintResult` |
| Watch 类型       | `MaskSegmentWatchState`、`MaskSegmentWatchDetail`                                    |
| 配置类型           | `PipelineConfig`、`MaskSegmentConfig`、`PaintConfig`、`InteractionConfig`              |
| 语义色            | `MASK_SEMANTIC_COLORS`、`BASEBOARD_SEMANTIC_NAME`                                    |
| 工具             | `prewarmPngBgrCacheAsync`、`prewarmPngBgrCache`                                      |
| 运行时            | `DEFAULT_*_CONFIG`、`getMaskSegmentRuntimeConfig`、`setMaskSegmentRuntimeConfig`      |


---

## 推荐：通过 example/ 目录学习集成

`example/` 是**专门为业务侧集成准备的演示文件夹**，它：

- 只通过 `import ... from 'react-native-mask-segment-canvas'` 使用公开 API（不碰内部 src）
- 提供了独立的 `package.json`（含 peer deps + 本地 file 依赖）
- 包含针对本地联调的 `metro.config.js`
- `App.tsx` 是一个可直接参考的完整页面，涵盖预热、状态管理、ref 操作、回调处理等

建议：

1. 直接阅读 `example/App.tsx` 获取最新可运行的集成写法。
2. 按 `example/README.md` 的步骤在本机跑起来，验证安装、patch、Metro 配置是否正确。
3. 把 `example/App.tsx` 中的核心逻辑复制到你自己的页面/组件中即可。

这样可以确保你接入的是「库的公开契约」，而不是内部实现细节。

---

## 环境要求

- Node.js >= 18（推荐 20+）
- Xcode 15+（iOS）
- Android Studio + JDK 17（Android）
- CocoaPods（iOS）

## 快速开始（本仓库 Demo）

根目录 `App.tsx` 是库作者自测用的完整 Demo，内部直接 import `./src`。

```bash
cd MaskSegmentApp

npm install

cd ios && bundle exec pod install && cd ..

npm start

# 另开终端
npm run ios
# 或
npm run android
```

**想看「纯业务项目如何集成」**：请进入 `example/` 目录，按其 `README.md` 操作。它使用 `import from 'react-native-mask-segment-canvas'` + 标准的 `package.json` + Metro 配置，完全模拟消费者环境。

Demo 入口 `App.tsx` 通过 `./src`（即包入口 `src/index.ts`）引用组件，与业务侧 `import from 'react-native-mask-segment-canvas'` 等价。

---

## MaskSegmentCanvas 组件

### 引入

```tsx
import React, { useRef } from 'react';
import MaskSegmentCanvas, {
  type MaskSegmentCanvasRef,
  type MaskSegmentSession,
  type MaskSegmentWatchState,
  type MaskSegmentWatchDetail,
  type BgrColor,
  type MaskSemanticColor,
  type PaintCallbackPayload,
  MASK_SEMANTIC_COLORS,
  prewarmPngBgrCacheAsync,
} from 'react-native-mask-segment-canvas';
```

也可按需导入运行时默认值（与组件 Props 合并使用）：

```tsx
import {
  DEFAULT_PIPELINE_CONFIG,
  DEFAULT_MASK_CONFIG,
  DEFAULT_PAINT_CONFIG,
  DEFAULT_INTERACTION_CONFIG,
} from 'react-native-mask-segment-canvas';
```

### 最小示例

下面是一个可直接放进业务页面的完整示例，涵盖 **PNG 预热**、**state**、**配置**、**加载态**、**onWatch** 与 **ref** 常用操作。

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

/** 业务侧准备好的图片地址（本地 file:// 或 http(s)://） */
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

  // 示例：接口下载完成后写入路径，并预热 PNG 解码缓存
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
        <Text>等待原图与掩码…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {isCanvasLoading ? <Text>加载中：{watchState}</Text> : null}
      {watchState === 'interactive' ? (
        <Text>可上色（轮廓加载中…）</Text>
      ) : null}
      {isOutlineReady ? <Text>就绪</Text> : null}
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
          // detail: regionCount, maskPathsReady, freqLayersReady, errorMessage
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

      {/* ref 示例：disabled={!isInteractive} 时可按需绑定 */}
      {/* <Button title="保存" onPress={handleSave} disabled={!isInteractive} /> */}
      {/* <Button title="撤销" onPress={() => canvasRef.current?.reset()} /> */}
      {/* <Button title="对比" onPress={() => canvasRef.current?.swap()} /> */}
    </View>
  );
}
```

#### 示例里涉及的 state 说明


| state             | 类型                           | 用途                                               |
| ----------------- | ---------------------------- | ------------------------------------------------ |
| `imagePaths`      | `{ origin, mask } | null`    | 业务侧解析后的本地/远程图片路径                                 |
| `pathsError`      | `string`                     | 路径解析或 PNG 预热失败文案                                 |
| `watchState`      | `MaskSegmentWatchState | ''` | `onWatch` 上报的初始化阶段                               |
| `isInteractive`   | 派生                           | `interactive` 或 `mask_paths_ready` 时为 true，可开放操作 |
| `isOutlineReady`  | 派生                           | `mask_paths_ready` 时为 true，轮播虚线已就绪               |
| `isCanvasLoading` | 派生                           | 画布初始化阻塞 Loading（不含 PNG 路径等待）                     |
| `errorMessage`    | `string`                     | 由 `onError` 写入的分割/加载失败文案                         |
| `sessionDraft`    | `MaskSegmentSession | null`  | MMKV 等恢复的草稿                                      |


#### 配置项怎么选


| 配置         | 何时用顶层属性                          | 何时用嵌套 Config                              |
| ---------- | -------------------------------- | ----------------------------------------- |
| 语义识别色      | `semanticColors={...}` 大多数场景     | `maskConfig.semanticColors` 需与更多掩码参数一起传时  |
| 虚线颜色       | `regionOutlineColor="..."` 大多数场景 | `paintConfig.regionOverlayFill` 需同时改笔刷盘等时 |
| 黑色阈值、最大分区数 | —                                | `maskConfig`                              |
| 图片处理尺寸     | —                                | `pipelineConfig`                          |
| 轮播间隔、点击容差  | —                                | `interactionConfig`                       |


顶层属性与嵌套 Config **可同时传**，顶层 `semanticColors` / `regionOutlineColor` 优先级更高。

#### watchState 与 UI 建议

```ts
// 阻塞式 Loading（分区 + 上色图层就绪前）
const isLoading = ![
  'interactive',
  'mask_paths_ready',
  'error',
  '',
].includes(watchState);

// 允许点击选区、选色、上色（不必等轮廓路径）
const canOperate =
  watchState === 'interactive' || watchState === 'mask_paths_ready';

// 初始化轮播虚线已全部就绪（可选，用于收起「轮廓准备中」提示）
const isOutlineReady = watchState === 'mask_paths_ready';

// 显示错误页
const hasError = watchState === 'error';
```

`interactive` 时 `detail.maskPathsReady` 一般为 `false`；`mask_paths_ready` 时为 `true`。两者通常相差约 100ms（异步构建 Skia 轮廓路径），不影响点击上色。

`originUrl` / `maskUrl` 支持：

- 本地路径：`file:///...` 或绝对路径
- 远程地址：`http(s)://...`（组件内部会下载/解析）

> 兼容旧属性 `originImgPath` / `maskImgPath`（已标记 deprecated，请改用 `originUrl` / `maskUrl`）。

---

## Props

### 图片与初始化


| 属性                       | 类型                        | 必填  | 默认  | 说明                                                                |
| ------------------------ | ------------------------- | --- | --- | ----------------------------------------------------------------- |
| `originUrl`              | `string`                  | 是*  | —   | 原图地址（`file://`、绝对路径或 `http(s)://`）                                |
| `maskUrl`                | `string`                  | 是*  | —   | 掩码图地址（语义色块图，建议与原图同尺寸）                                             |
| `originImgPath`          | `string`                  | —   | —   | **deprecated**，请用 `originUrl`                                     |
| `maskImgPath`            | `string`                  | —   | —   | **deprecated**，请用 `maskUrl`                                       |
| `initialSession`         | `MaskSegmentSession`      | 否   | —   | 从 MMKV 等恢复的草稿；分区就绪后自动 `loadSession`                               |
| `initialPaintColor`      | `BgrColor`                | 否   | —   | **可选**。初始自定义笔刷色 `{ b, g, r }`；不传则默认无笔刷，需用户选色或 `ref.setPaintColor` |
| `initialPaintConfigJson` | `Record<string, unknown>` | 否   | —   | **可选**。与 `initialPaintColor` 配套的笔刷配置，上色成功时随 `onPaintCallback` 回传  |


### 识别色与虚线（顶层便捷配置）


| 属性                   | 类型                    | 默认                         | 说明                                         |
| -------------------- | --------------------- | -------------------------- | ------------------------------------------ |
| `semanticColors`     | `MaskSemanticColor[]` | `MASK_SEMANTIC_COLORS`     | 掩码语义识别色，等同 `maskConfig.semanticColors`     |
| `regionOutlineColor` | `string`              | `rgba(20, 120, 235, 0.58)` | 分区虚线高亮色，等同 `paintConfig.regionOverlayFill` |


顶层属性优先级高于嵌套 `maskConfig` / `paintConfig`。

`MaskSemanticColor` 结构：

```ts
{
  name: string;   // 语义名，如 wall / ceiling / baseboard
  hex: string;    // 展示用十六进制色
  bgr: { b: number; g: number; r: number }; // 与掩码像素 BGR 通道一致
}
```

内置色表：`MASK_SEMANTIC_COLORS`（`src/utils/maskSemanticPalette.ts`）。

### maskConfig


| 字段                             | 类型                    | 默认                       | 说明                                    |
| ------------------------------ | --------------------- | ------------------------ | ------------------------------------- |
| `semanticColors`               | `MaskSemanticColor[]` | 内置色表                     | 掩码语义色（可被顶层 `semanticColors` 覆盖）       |
| `blackThreshold`               | `number`              | `30`                     | BGR 最大值低于此值的像素视为黑色背景                  |
| `maxRegionColors`              | `number`              | `6`                      | 最终保留的最大语义分区数                          |
| `quantStep`                    | `number`              | `64`                     | 踢脚线量化步长                               |
| `baseboardMaxColorDist`        | `number`              | `42`                     | 踢脚线色距阈值                               |
| `baseboardStripQuantKeys`      | `string[]`            | 内置键集                     | 踢脚线条带量化键，格式 `"b,g,r"`                 |
| `wallQuantKeys`                | `string[]`            | 内置键集                     | 墙面量化键                                 |
| `cabinetQuantKeys`             | `string[]`            | 内置键集                     | 柜体量化键                                 |
| `secondarySemanticNames`       | `string[]`            | `garageDoor, roof, eave` | 次要语义名                                 |
| `secondaryMinPixelRatio`       | `number`              | `0.002`                  | 次要语义最小像素占比                            |
| `junctionHRadiusPx`            | `number`              | `24`                     | 踢脚线交界水平半径                             |
| `junctionVRadiusPx`            | `number`              | `2`                      | 踢脚线交界垂直半径                             |
| `kickBridgeHalfWPx`            | `number`              | `6`                      | 踢脚线横向补缝半宽                             |
| `baseboardJunctionRowMarginPx` | `number`              | `1`                      | 踢脚线交界行边距                              |
| `baseboardJunctionVReachPx`    | `number`              | `2`                      | 踢脚线交界纵向延伸                             |
| `baseboardMinRunPx`            | `number`              | `2`                      | 蒙版条带最小 run 长度                         |
| `splitWalls`                   | `boolean`             | `false`                  | 在 wall 掩码内按纹理边界细分为 `wall-1`、`wall-2`… |
| `splitWallsMaxCount`           | `number`              | `8`                      | 墙壁子区最大数量                              |
| `splitWallsMinAreaRatio`       | `number`              | `0.002`                  | 碎块最小面积比（相对 seg 总像素）                   |
| `splitWallsColorDistSq`        | `number`              | `1400`                   | 连通域色度均值距离平方阈值（墙内光影容忍，材质间更严）           |
| `splitWallsChromaBlurRadius`   | `number`              | `5`                      | 预留：色度平滑半径                             |
| `splitWallsNeutralChromaMax`   | `number`              | `14`                     | 白/灰墙低饱和判定半径；与有色墙强制分界                  |


开启 `splitWalls` 后，原有单一 `wall` 区域会被替换为多个 `wall-N` 子区，各自独立上色与撤销。旧 Session 中 `regionName: 'wall'` 无法映射到新子区名，需重新上色。

### pipelineConfig


| 字段                         | 类型       | 默认      | 说明                      |
| -------------------------- | -------- | ------- | ----------------------- |
| `maxImageLongSide`         | `number` | `720`   | 分割 / pickMap / 工作区缩放最长边 |
| `paintFreqMaxLongSide`     | `number` | `480`   | OpenCV LAB 高低频最长边       |
| `originPreviewMaxLongSide` | `number` | `360`   | 预览最长边（主路径走工作区分辨率）       |
| `maskPathMaxLongSide`      | `number` | `480`   | 虚线轮廓降采样最长边              |
| `minContourArea`           | `number` | `100`   | 最小轮廓面积（随缩放同比缩放）         |
| `contourApproxEpsilon`     | `number` | `0.003` | 轮廓多边形逼近系数               |
| `maxRegions`               | `number` | `500`   | 分割阶段最大区域数上限             |


### paintConfig


| 字段                         | 类型           | 默认                      | 说明                         |
| -------------------------- | ------------ | ----------------------- | -------------------------- |
| `palette`                  | `BgrColor[]` | 6 色内置盘                  | 底部笔刷色条                     |
| `colorBaseOpacity`         | `number`     | `0.88`                  | 底色不透明度                     |
| `lLightOpacity`            | `number`     | `0.50`                  | L 通道叠加强度                   |
| `textureOpacity`           | `number`     | `0.85`                  | 高频纹理叠加强度（纹理保留更强）           |
| `lLowBlurKernel`           | `number`     | `7`                     | 低频高斯核（奇数）                  |
| `lLowContrast`             | `number`     | `1.15`                  | 低频对比度                      |
| `lLowBrightness`           | `number`     | `0.9`                   | 低频亮度                       |
| `lHighGain`                | `number`     | `1.22`                  | 高频增益                       |
| `maskFeatherColor`         | `number`     | `1.6`                   | 上色边缘羽化（颜色）——软边 alpha 半径，像素 |
| `maskFeatherTexture`       | `number`     | `0.9`                   | 上色边缘羽化（纹理）——预留/辅助          |
| `regionOverlayFill`        | `string`     | `rgba(20,120,235,0.58)` | 虚线/高亮填充色                   |
| `regionOutlineStrokeWidth` | `number`     | `4`                     | 虚线描边宽度                     |


### interactionConfig


| 字段                      | 类型        | 默认      | 说明                  |
| ----------------------- | --------- | ------- | ------------------- |
| `pickMapSearchRadiusPx` | `number`  | `14`    | 点击 pickMap 搜索半径（像素） |
| `kickMaskPickRadiusPx`  | `number`  | `36`    | 踢脚线掩码拾取半径           |
| `thinStripPadding`      | `number`  | `0.008` | 细条带（踢脚线）点击扩展比例      |
| `regionPadding`         | `number`  | `0.003` | 普通分区点击扩展比例          |
| `initRegionFlashMs`     | `number`  | `1000`  | 初始化轮播每条虚线停留毫秒       |
| `enableInitRegionFlash` | `boolean` | `true`  | 是否启用初始化轮播           |


> 完整默认值常量：`DEFAULT_MASK_CONFIG`、`DEFAULT_PIPELINE_CONFIG`、`DEFAULT_PAINT_CONFIG`、`DEFAULT_INTERACTION_CONFIG`（自包入口导出）。

### UI 开关与样式


| 属性                                               | 类型                     | 默认      | 说明                     |
| ------------------------------------------------ | ---------------------- | ------- | ---------------------- |
| `showToolbar`                                    | `boolean`              | `true`  | 顶部「清空缓存重新分区」工具栏        |
| `showColorBar`                                   | `boolean`              | `true`  | 底部笔刷色条                 |
| `showStatusRow`                                  | `boolean`              | `true`  | 分割/加载状态文案              |
| `showOverlayButtons`                             | `boolean`              | `true`  | 左下撤销、右下对比原图按钮          |
| `showDebugPickers`                               | `boolean`              | `true`  | 相册选图调试入口（生产建议 `false`） |
| `disabled`                                       | `boolean`              | `false` | 禁用上色交互                 |
| `style`                                          | `ViewStyle`            | —       | 外层容器样式                 |
| `canvasStyle`                                    | `ViewStyle`            | —       | 画布区域样式                 |
| `undoButtonStyle` / `compareButtonStyle`         | `ViewStyle`            | —       | 浮层按钮样式                 |
| `undoButtonTextStyle` / `compareButtonTextStyle` | `TextStyle`            | —       | 浮层按钮文字样式               |
| `undoButtonText`                                 | `string`               | `撤销`    | 撤销按钮文案                 |
| `compareButtonText`                              | `string`               | `对比原图`  | 进入对比模式文案               |
| `compareExitButtonText`                          | `string`               | `退出对比`  | 退出对比模式文案               |
| `renderUndoButton`                               | `(props) => ReactNode` | —       | 自定义撤销按钮                |
| `renderCompareButton`                            | `(props) => ReactNode` | —       | 自定义对比按钮                |


### 回调


| 属性                | 签名                                        | 说明                                 |
| ----------------- | ----------------------------------------- | ---------------------------------- |
| `onWatch`         | `(state, durationMs, detail?) => void`    | 初始化阶段回调；`durationMs` 自本次 `init` 起算 |
| `onPaintCallback` | `(payload: PaintCallbackPayload) => void` | 上色成功或未选笔刷时点击分区                     |
| `onError`         | `(message, error?) => void`               | 分割或加载失败                            |


`PaintCallbackPayload`（判别联合，`payload.kind` 区分）：

```ts
// 上色成功
{
  kind: 'painted';
  regionId: number;
  regionName: string;
  color: BgrColor;
  configJson?: Record<string, unknown>; // setPaintColor / initialPaintConfigJson 传入
}

// 未选笔刷时点击有效分区（不会上色）
{
  kind: 'brush_required';
  hint: string;       // 如「请先选择笔刷颜色（底部色条或 ref.setPaintColor）」
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

`onWatch` 的 `detail`（`MaskSegmentWatchDetail`）：


| 字段                | 类型        | 说明                |
| ----------------- | --------- | ----------------- |
| `regionCount`     | `number`  | 当前有效分区数           |
| `maskPathsReady`  | `boolean` | 轮廓 Skia 路径是否就绪    |
| `freqLayersReady` | `boolean` | 高低频 Shader 纹理是否就绪 |
| `errorMessage`    | `string`  | `error` 状态下的失败说明  |


#### onWatch 状态流转

```
init
  → images_loaded      原图 + 掩码读取完成
  → mask_aligned       掩码尺寸对齐完成
  → mask_sampled       掩码像素采样完成
  → regions_ready      分区提取成功
  → layers_ready       上色纹理图层就绪（detail.maskPathsReady 可能仍为 false）
  → interactive        可交互（可点击选区、选色、上色）
  → mask_paths_ready   轮廓路径就绪（初始化轮播虚线可显示，detail.maskPathsReady 为 true）
  → error              失败（detail.errorMessage 有说明）
```

`layers_ready` / `interactive` 可能在轮廓路径算完之前触发；业务侧若以 `interactive` 关闭 Loading，用户即可操作，轮播虚线会在 `mask_paths_ready` 后自动出现。

---

## Ref 方法

通过 `ref` 调用（类型 `MaskSegmentCanvasRef`）：


| 方法                  | 签名                                       | 说明                                    |
| ------------------- | ---------------------------------------- | ------------------------------------- |
| `reset`             | `() => void`                             | 撤销上一步上色（按 `paintHistory`）             |
| `swap`              | `(showOrigin?: boolean) => void`         | 对比原图；不传参 toggle，传 `true`/`false` 显式开关 |
| `save`              | `(options?) => Promise<SavePaintResult>` | 合成并保存 PNG；`options.destDir` 可选输出目录    |
| `session`           | `() => MaskSegmentSession`               | 导出可 JSON 序列化会话（存 MMKV）                |
| `loadSession`       | `(session) => void`                      | 恢复上色状态（也可通过 `initialSession`）         |
| `setPaintColor`     | `(color, configJson?) => void`           | 设置当前笔刷色，清空底部色条选中                      |
| `setMaskConfig`     | `(config) => void`                       | 运行时更新掩码配置并**重新分割**                    |
| `clearAllPaint`     | `() => void`                             | 清空全部上色记录                              |
| `resegment`         | `() => Promise<void>`                    | 清空 PNG 缓存并重新分割                        |
| `getRegions`        | `() => SegmentRegion[]`                  | 当前分区列表快照                              |
| `getPaintedRegions` | `() => PaintedRegionRecord[]`            | 当前上色记录快照                              |


`SavePaintResult`：`{ filePath, width, height, paintedCount, previewPath? }`

代码示例：

```tsx
const ref = useRef<MaskSegmentCanvasRef>(null);

ref.current?.reset();
ref.current?.swap();           // toggle
ref.current?.swap(true);       // 强制显示原图

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

> `save` 依赖工作区 buffer 与 pickMap 就绪（通常 `interactive` 之后）；未就绪时 throw `'图像尚未就绪，无法保存'`。

### 存储约定


| 能力              | 建议存储                | 内容                      |
| --------------- | ------------------- | ----------------------- |
| `ref.save()`    | 文件系统                | 大图 PNG 路径               |
| `ref.session()` | MMKV / AsyncStorage | JSON 元数据（URL、上色记录、笔刷色等） |


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

## 交互说明

1. **初始化轮播**：分区就绪后，按 `initRegionFlashMs`（默认 1s）轮播各分区虚线轮廓；用户触摸画布后停止。
2. **预览（未选笔刷）**：长按分区显示当前触摸点所在连通块的虚线轮廓；点击黑色区域不显示虚线。
3. **上色（已选笔刷）**：先点底部色条或 `ref.setPaintColor`（也可通过 `initialPaintColor` 预设），再点击分区上色；同一分区重复点击会覆盖颜色。
4. **未选笔刷点击分区**：不会上色；`onPaintCallback` 以 `kind: 'brush_required'` 回调，携带 `hint` 与目标分区信息，由业务侧 Toast / 弹窗提示用户选色。
5. **撤销**：左下角按钮或 `ref.reset()`，按上色历史逐步撤回。
6. **对比原图**：右下角按钮或 `ref.swap()`，隐藏上色层查看原图。

---

## 接入业务示例

### 下载后预热再挂载（推荐）

```tsx
import { prewarmPngBgrCacheAsync } from 'react-native-mask-segment-canvas';

async function openPaintScreen(originUrl: string, maskUrl: string) {
  await prewarmPngBgrCacheAsync([originUrl, maskUrl]);
  navigation.navigate('Paint', { originUrl, maskUrl });
}
```

### 接口下载后传入本地路径

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

### 草稿恢复

```tsx
const draft = JSON.parse(mmkv.getString('paint_draft'));

<MaskSegmentCanvas
  originUrl={draft.originUrl}
  maskUrl={draft.maskUrl}
  initialSession={draft}
/>
```

### 自定义语义色表

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

## 项目结构

```
MaskSegmentApp/                              # 仓库根目录（npm 包 react-native-mask-segment-canvas）
├── App.tsx                                  # 库自测 Demo（直接引用 ./src）
├── src/
│   ├── index.ts                             # npm 包入口（业务 import 'react-native-mask-segment-canvas'）
│   ├── components/
│   │   ├── MaskSegmentCanvas.tsx
│   │   └── MaskSegmentCanvas.types.ts
│   └── utils/
│       ├── maskSegmentation.ts
│       ├── maskSegmentRuntime.ts
│       ├── maskSemanticPalette.ts
│       └── ...
├── example/                                 # ★ 推荐：业务集成演示（消费者视角）
│   ├── App.tsx                              # 只使用公开 API 的完整示例页面
│   ├── index.js / app.json
│   ├── package.json                         # 展示所需依赖 + "react-native-mask-segment-canvas": "file:.."
│   ├── metro.config.js / babel.config.js / tsconfig.json
│   └── README.md                            # 如何在真实项目中接入的说明
├── patches/                                 # 随包发布，宿主 postinstall 应用
├── ios/                                     # 根 Demo 原生工程（不发布到 npm）
└── android/
```

---

## 依赖说明


| 包                                | 用途                           |
| -------------------------------- | ---------------------------- |
| `@shopify/react-native-skia`     | Canvas 渲染、Path、虚线描边、Blend 混合 |
| `react-native-fast-opencv`       | 掩码形态学、轮廓处理                   |
| `react-native-fs`                | 图层缓存、保存 PNG                  |
| `react-native-image-picker`      | Demo 相册选图                    |
| `react-native-reanimated`        | Skia 动画依赖                    |
| `react-native-safe-area-context` | 安全区适配                        |


---

## 性能评测

以下数据基于 Demo 测试图（`assets/test/origin.png` **1080×1920**、6 个语义分区）、**默认 `pipelineConfig`**，以及 `onWatch` 的 `durationMs`（从 `init` 起算）。为**经验区间**，非严格基准测试；真机因 CPU、存储、RN 版本会有波动。

### 实测参考（开发环境 + PNG 预热）

Demo 在挂载画布前调用 `prewarmPngBgrCacheAsync([origin, mask])`，PNG 解码命中内存缓存。典型日志：


| 阶段      | watchState                       | 约耗时            | 说明                                   |
| ------- | -------------------------------- | -------------- | ------------------------------------ |
| 掩码对齐    | `mask_aligned`                   | ~160ms         | 掩码缩放到分割工作分辨率                         |
| 分区完成    | `regions_ready` / `mask_sampled` | ~320ms         | 布局扫描 + 踢脚线 + pickMap                 |
| **可交互** | `**interactive`**                | **~320–450ms** | 可点击选区、选色、Shader 上色                   |
| 轮廓就绪    | `mask_paths_ready`               | ~430–550ms     | 比 `interactive` 晚 **~100ms**，轮播虚线可显示 |


`interactive` **不等待**轮廓路径；`mask_paths_ready` 仅影响初始化轮播虚线与可选 UI 提示。

同图各子步骤（`__DEV__` 日志，默认 pipeline）量级：


| 子步骤               | 约耗时       | 工作分辨率                          |
| ----------------- | --------- | ------------------------------ |
| OpenCV LAB 高低频    | ~10–40ms  | 270×480                        |
| 高低频 Skia 纹理       | ~20–30ms  | 同上                             |
| 布局扫描 + 踢脚线 + 点击查表 | ~90–120ms | 405×720（1080p 缩至 longSide 720） |
| 全量轮廓路径（异步，不阻塞交互）  | ~80–150ms | 270×480                        |


### 分辨率与 `pipelineConfig` 的关系

计算密集型步骤被 **最长边上限** 截断，**不随 4K/8K 原图线性放大**；**PNG 全图解码**仍随像素量线性增长。


| 步骤             | 配置项                         | 1080×1920 实际处理尺寸 | 随原图像素增长                  |
| -------------- | --------------------------- | ---------------- | ------------------------ |
| PNG 解码         | —                           | 1080×1920 × 2 张  | **是**                    |
| 掩码分割 / pickMap | `maxImageLongSide: 720`     | ~405×720         | **否**（长边 >720 时固定）       |
| Shader 高低频     | `paintFreqMaxLongSide: 480` | ~270×480         | **否**                    |
| 工作区 Skia 原图    | 同 `maxImageLongSide`        | ~405×720         | **否**                    |
| 虚线轮廓           | `maskPathMaxLongSide: 480`  | ~270×480         | **否**（不阻塞 `interactive`） |


### `interactive` 预估（默认 pipeline）


| 原图规格           | 相对 1080p 像素 | 有 PNG 预热      | 冷启动（无预热）       |
| -------------- | ----------- | ------------- | -------------- |
| 1080×1920      | 1×          | **320–450ms** | **450–700ms**  |
| 1440×2560 (2K) | ~1.8×       | **400–550ms** | **600–900ms**  |
| 3840×2160 (4K) | ~4×         | **500–750ms** | **800–1200ms** |
| 7680×4320 (8K) | ~16×        | **0.8–1.5s**  | **1.5–3s+**    |


> **300ms 内可交互**：在 1080p + 预热 + 默认 pipeline + 中高端机上**接近但偏乐观**；不宜作为全机型 SLA。

### 机型档位（1080p，默认 pipeline）

相对上述开发环境 ~320ms 的量级：


| 档位                   | 相对倍数     | 有预热 `interactive` | 冷启动        |
| -------------------- | -------- | ----------------- | ---------- |
| 旗舰 iOS / 新旗舰 Android | 0.8–1.2× | 300–450ms         | 500–800ms  |
| 中端 Android           | 1.5–2.5× | 500–800ms         | 700ms–1.2s |
| 低端 Android（4GB、老 U）  | 2.5–4×   | 800ms–1.3s        | 1–2s+      |


Android 额外开销主要来自：JS ↔ OpenCV bridge、内存带宽/GC、Skia 纹理上传。

### 提高 `maxImageLongSide` 的影响

若将 `pipelineConfig.maxImageLongSide` 设为 **1280**（高于默认 720），分割工作区约 **720×1280**，像素约为 720 档的 **3×**：


| 场景                       | 默认 720     | 改为 1280       |
| ------------------------ | ---------- | ------------- |
| 1080p `interactive`（中端机） | ~320–800ms | **500ms–1s+** |
| 分割 / pickMap 耗时          | ~90–120ms  | ~250–350ms    |


更高精度换更长初始化；若目标仍是 **<500ms 可交互**，建议维持默认 **720**，必要时降至 **640**。

### 优化建议

1. **PNG 预热（推荐）**：下载或解压完成后、进入画面前调用 `prewarmPngBgrCacheAsync`，通常可省 **100–250ms**（低端机收益最大）。

```tsx
import { prewarmPngBgrCacheAsync } from 'react-native-mask-segment-canvas';

await prewarmPngBgrCacheAsync([originPath, maskPath]);
// 再挂载 MaskSegmentCanvas
```

1. **Loading 时机**：阻塞式 Loading 在 `interactive` 关闭；「轮廓准备中」可选监听 `mask_paths_ready`。
2. **大图 / 低端机**：保持默认 `maxImageLongSide: 720`；可再将 `paintFreqMaxLongSide` 降至 **360**。
3. **4K 素材**：业务侧先下采样再传入，或接受 **0.8–1.5s** 量级的 `interactive`（预热后）。
4. **观测**：开发环境关注 Metro 中 `[MaskSegment]`、`[⏱ ...]` 与 `onWatch` 的 `durationMs`。

---

## 注意事项

- 掩码图应为与原图同尺寸的语义色块图（黑底 + 纯色分区）；黑色区域（`blackThreshold` 默认 30 以下）不参与分区。
- OpenCV 分割在 JS 线程执行，超大图可能卡顿；可通过 `pipelineConfig.maxImageLongSide` 限制处理尺寸。
- iOS 相册选图需相册权限（仅 `showDebugPickers` 开启时用到）。
- `semanticColors` 须与后端/标注掩码的语义色保持一致，否则识别会偏移。

---

## 故障排查

**iOS pod install 失败**

```bash
cd ios
bundle install
bundle exec pod install --repo-update
```

**Android 编译报错**

```bash
cd android && ./gradlew clean && cd ..
```

**分割失败 / 分区为空**

- 确认 `originUrl` / `maskUrl` 可访问
- 确认掩码语义色与 `semanticColors` 配置一致
- 查看 Metro 日志中的 `[MaskSegment]` / `[⏱ ...]` 输出

**虚线不贴边 / 出现多余轮廓**

- 虚线基于掩码像素外轮廓生成，长按仅显示触摸点所在连通块
- 初始化轮播仅显示该语义分区最大连通块

