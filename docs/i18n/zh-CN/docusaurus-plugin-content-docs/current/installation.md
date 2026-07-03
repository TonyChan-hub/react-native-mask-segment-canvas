---
id: installation
title: 安装
---

# 📦 安装

## Peer 依赖

在宿主项目中安装以下依赖（版本应与宿主 RN 版本匹配）：

```bash
npm install @shopify/react-native-skia react-native-reanimated react-native-fast-opencv react-native-fs buffer upng-js react-native-gesture-handler
# 如果使用 showDebugPickers（相册选择器）
npm install react-native-image-picker
# 安全区域边距
npm install react-native-safe-area-context
```

## 安装后设置

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

## iOS / Android 原生依赖

```bash
cd ios && pod install && cd ..
```

确保宿主项目已按照各库文档完成 Skia、Reanimated 和 OpenCV 的原生设置。

## Metro 配置

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

## 故障排除：重复模块错误

常见症状：

- `SkiaPictureView must be a function (received 'undefined')`
- `createAnimatedNode: Animated node[...] already exists`

这些问题几乎都是由于 Metro 解析了多份 reanimated / skia / gesture-handler / fast-opencv / safe-area 包副本导致的。

**最佳实践：**

1. 从 `example/metro.config.js` 复制 `singletonPackages` + `extraNodeModules` + `blockList` 模式
2. 在 `index.js` 顶部按顺序导入 gesture-handler → reanimated → skia
3. 使用 `--reset-cache` 重启 Metro 并重新安装应用

详细清单和模板请参阅示例项目。

### 集成方式

| 方式 | 说明 |
| --- | --- |
| `npm install` | 生产环境推荐 |
| `npm link` | 本地开发 |
| `file:..` | 相对路径依赖 |
