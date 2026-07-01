# MaskSegmentCanvas Example

这是一个**完全模拟真实业务项目集成**的 Demo，展示如何在你的 React Native 工程中接入 `react-native-mask-segment-canvas`。

## 与库本身 Demo 的区别

| 项目 | 引入方式 | 用途 |
| ---- | -------- | ---- |
| 根目录 `App.tsx` | `import ... from './src'`（内部源码） | 库作者自测 |
| **本 example/** | `import ... from 'react-native-mask-segment-canvas'`（公开 API） | **业务集成参考** |

本 example 只依赖库的公开 API，不触碰 `src/` 内部实现，是你接入时可以直接复制的模板。

## 快速开始

```bash
# 1. 进入 example 目录
cd example

# 2. 安装依赖（自动 link 父目录的库）
npm install

# 3. 应用 postinstall 补丁（patch-package 修补 react-native-fast-opencv）
#    npm install 后自动执行，若未执行请手动：
npx patch-package

# 4. iOS：安装原生依赖
cd ios && pod install && cd ..

# 5. 启动 Metro
npm start

# 6. 另开终端运行
npm run ios
# 或
npm run android
```

## 文件说明

```
example/
├── App.tsx              # ★ 核心：完整的集成示例页面
├── index.js             # RN 入口（注册 gesture-handler + Buffer polyfill）
├── app.json             # 应用名配置
├── package.json         # 独立依赖配置，"react-native-mask-segment-canvas": "file:.."
├── metro.config.js      # Metro 配置（watchFolders 指向父目录）
├── babel.config.js      # Babel 配置（含 reanimated 插件）
├── tsconfig.json        # TypeScript 配置
└── README.md            # 本文件
```

## App.tsx 覆盖的功能点

`App.tsx` 是一个可直接参考的完整页面，涵盖：

| 功能 | 对应代码位置 |
| ---- | ------------ |
| **PNG 预热** | `useEffect` → `prewarmPngBgrCacheAsync` |
| **状态管理** | `watchState` / `isInteractive` / `isOutlineReady` 等派生状态 |
| **onWatch 回调** | `handleWatch` — 跟踪初始化阶段 |
| **onPaintCallback** | `handlePaintCallback` — 处理上色成功 / 未选笔刷两种场景 |
| **onError 回调** | `handleError` — 捕获分割/加载失败 |
| **Ref 操作** | `save` / `reset` / `swap` / `clearAllPaint` / `session` |
| **setPaintColor** | 预设笔刷色，通过 `ref.setPaintColor` 设置 |
| **自定义语义色表** | `GYM_CUSTOM_COLORS` 示例 + 模式切换 UI |
| **Pipeline 精度切换** | `pipelinePreset` 低/中/高精度切换 |
| **Toast 提示** | 未选笔刷时 `brush_required` 回调 + 自定义 Toast |
| **加载态/错误态 UI** | PNG 预热加载、初始化 Loading、错误展示 |
| **草稿恢复** | `sessionDraft` 状态 + `initialSession` prop |

## 集成到自己项目

### 方式一：npm install（推荐生产环境）

```bash
npm install react-native-mask-segment-canvas
```

### 方式二：本地联调（开发阶段）

```bash
# 在库目录
npm link

# 在你的项目
npm link react-native-mask-segment-canvas
```

你的 `metro.config.js` 需要添加：

```js
const path = require('path');

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: [path.resolve(__dirname, '../MaskSegmentApp')],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
  },
});
```

### 方式三：file: 依赖（本 example 使用的方式）

```json
{
  "dependencies": {
    "react-native-mask-segment-canvas": "file:../MaskSegmentApp"
  }
}
```

### 必装 peerDependencies

```bash
npm install @shopify/react-native-skia react-native-reanimated react-native-fast-opencv react-native-fs buffer
# 若使用相册选图
npm install react-native-image-picker
# 安全区适配
npm install react-native-safe-area-context
```

### postinstall 配置

你的 `package.json` 需要：

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

## 常见问题

**`npm install` 后报模块找不到？**
- 确认已执行 `postinstall`（`npx patch-package`）
- 检查 Metro 配置中 `watchFolders` 是否包含库目录

**`pod install` 失败？**
```bash
cd ios
bundle install
bundle exec pod install --repo-update
```

**Android 编译错误？**
```bash
cd android && ./gradlew clean && cd ..
```

**运行时出现「重复模块」类错误（最常见）**

在 monorepo、npm link、`file:..` 场景下，经常会遇到下面这些「类似问题」：

- `SkiaPictureView must be a function (received 'undefined')`
- `createAnimatedNode: Animated node[...] already exists`（含 UIFrameGuarded 变体）
- 其他 Fabric ViewManager / native module 单例冲突

**原因**：Metro 同时加载了多份 `@shopify/react-native-skia`、`react-native-reanimated`、`react-native-gesture-handler`、`react-native-fast-opencv`、`react-native-safe-area-context` 等 peer 依赖。

**推荐完整解决方案**（直接复制到你的项目）：

1. **index.js 最顶部**（必须在最前面）：

   ```js
   import 'react-native-gesture-handler';
   import 'react-native-reanimated';
   import '@shopify/react-native-skia';
   ```

2. **metro.config.js**（使用 extraNodeModules + blockList 双保险）：

   ```js
   const path = require('path');
   const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

   const yourNodeModules = path.resolve(__dirname, 'node_modules');

   const singletons = [
     'react', 'react-native',
     'react-native-reanimated',
     '@shopify/react-native-skia',
     'react-native-gesture-handler',
     'react-native-fast-opencv',
     'react-native-safe-area-context',
     'react-native-fs',
     'react-native-image-picker',
   ];

   module.exports = mergeConfig(getDefaultConfig(__dirname), {
     watchFolders: [path.resolve(__dirname, '../MaskSegmentApp')],
     resolver: {
       nodeModulesPaths: [yourNodeModules],
       extraNodeModules: singletons.reduce((acc, p) => (acc[p] = path.resolve(yourNodeModules, p), acc), {}),
       blockList: singletons.map(p => new RegExp(`/MaskSegmentApp/node_modules/${p.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}/`)),
     },
   });
   ```

   > `example/metro.config.js` 已经是按这个标准模板写的，可直接参考。

做完上面两步后，**必须**：
- 重启 Metro（`npx react-native start --reset-cache`）
- 重新安装 app（建议先 `cd android && ./gradlew clean` 或 iOS pod 后重跑）

这样能一次性解决所有「同类」重复模块导致的运行时错误。
