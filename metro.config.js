const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration for library development (root).
 *
 * 主要目的：
 * - 当同时存在 example/ 目录时，防止 Metro 意外从 example/node_modules 里解析到
 *   另一份 react / reanimated / skia 等带原生/JSI 的包，导致和根目录的实例冲突。
 *
 * 如果你只在 example/ 目录下开发测试，请优先关注 example/metro.config.js。
 *
 * 这里也使用和 example 一致的 singletonPackages 列表，方便维护。
 */

const rootNodeModules = path.resolve(__dirname, 'node_modules');
const exampleNodeModules = path.resolve(__dirname, 'example/node_modules');

// 与 example/ 保持一致的必须单例列表
const singletonPackages = [
  'react',
  'react-native',
  'react-native-reanimated',
  '@shopify/react-native-skia',
  'react-native-gesture-handler',
  'react-native-fast-opencv',
  'react-native-safe-area-context',
  'react-native-fs',
  'react-native-image-picker',
];

const config = {
  resolver: {
    nodeModulesPaths: [rootNodeModules, exampleNodeModules],

    extraNodeModules: singletonPackages.reduce((acc, pkg) => {
      acc[pkg] = path.resolve(rootNodeModules, pkg);
      return acc;
    }, {}),

    blockList: singletonPackages.map(
      (pkg) => new RegExp(`/example/node_modules/${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`),
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
