const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration for the example app.
 *
 * 关键目标：在 monorepo / "file:.." / npm link 场景下，保证所有带原生/JSI/Fabric 代码的
 * peer 依赖都只解析到 **example/node_modules** 下的那一份。
 *
 * 重复解析会导致各种“类似问题”：
 * - SkiaPictureView config getter 为 undefined
 * - createAnimatedNode: Animated node[...] already exists (Reanimated)
 * - 各种 View 注册冲突、Invalid hook call 等
 *
 * 维护原则：凡是 package.json peerDependencies 里声明的、且包含原生代码的，都必须在这里强制单例。
 */

const parentRoot = path.resolve(__dirname, '..');
const exampleNodeModules = path.resolve(__dirname, 'node_modules');

// 必须单例的依赖列表（来自本库的 peerDependencies + 常见会引发冲突的）。
// 以后新增 peer 依赖时，记得同步更新这里。
const singletonPackages = [
  'react',
  'react-native',
  'react-native-reanimated',
  '@shopify/react-native-skia',
  'react-native-gesture-handler',
  'react-native-fast-opencv',
  'react-native-safe-area-context',
  'react-native-fs',
  // 可选 peer
  'react-native-image-picker',
];

const config = {
  watchFolders: [parentRoot],
  resolver: {
    nodeModulesPaths: [exampleNodeModules],

    // 方式一（最强）：extraNodeModules 强制别名
    // 让 import 'xxx' 永远拿到 example/node_modules 里的实例
    extraNodeModules: singletonPackages.reduce((acc, pkg) => {
      acc[pkg] = path.resolve(exampleNodeModules, pkg);
      return acc;
    }, {}),

    // 方式二（双保险）：blockList 完全禁止 Metro 去父目录的 node_modules 里找这些包
    blockList: singletonPackages.map(
      (pkg) => new RegExp(`/MaskSegmentApp/node_modules/${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`),
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
