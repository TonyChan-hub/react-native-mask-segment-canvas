---
id: installation
title: Installation
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 📦 Installation

## Peer Dependencies

Install these in your host project (versions should match your host RN version):

```bash
npm install @shopify/react-native-skia react-native-reanimated react-native-fast-opencv react-native-fs buffer upng-js react-native-gesture-handler
# If using showDebugPickers (photo library picker)
npm install react-native-image-picker
# Safe area insets
npm install react-native-safe-area-context
```

## Postinstall Setup

This library relies on `patch-package` to patch `react-native-fast-opencv`. Your host `package.json` must include:

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

After installing this library, patches from `node_modules/react-native-mask-segment-canvas/patches/` are applied automatically during the host's `postinstall`.

## iOS / Android Native Dependencies

```bash
cd ios && pod install && cd ..
```

Ensure the host project has completed Skia, Reanimated, and OpenCV native setup per each library's documentation.

## Metro Configuration

When using `npm link`, a monorepo, or `file:` dependencies, add this library to `watchFolders` and use `extraNodeModules` + `blockList` to prevent duplicate module resolution:

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

**Strongly recommended** — add this at the very top of the host `index.js` (before any business code):

```js
import '@shopify/react-native-skia';
```

See `example/metro.config.js` and `example/index.js` for the complete configuration with all peer singleton packages.

## Troubleshooting: Duplicate Module Errors

Common symptoms:

- `SkiaPictureView must be a function (received 'undefined')`
- `createAnimatedNode: Animated node[...] already exists`

These are almost always caused by Metro resolving multiple copies of reanimated / skia / gesture-handler / fast-opencv / safe-area packages.

**Best practice:**

1. Copy the `singletonPackages` + `extraNodeModules` + `blockList` pattern from `example/metro.config.js`
2. At the top of your `index.js`, import gesture-handler → reanimated → skia in order
3. Restart Metro with `--reset-cache` and reinstall the app

See the example project for a detailed checklist and template.

### Integration Methods

<Tabs>
<TabItem value="npm" label="npm install (Production)">

```bash
npm install react-native-mask-segment-canvas
```

</TabItem>
<TabItem value="link" label="npm link (Development)">

```bash
# In the library directory
npm link

# In your project
npm link react-native-mask-segment-canvas
```

</TabItem>
<TabItem value="file" label="file: dependency">

```json
{
  "dependencies": {
    "react-native-mask-segment-canvas": "file:../MaskSegmentApp"
  }
}
```

</TabItem>
</Tabs>
