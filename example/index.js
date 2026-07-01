/**
 * @format
 */

// 【关键 - 必须最顶部】按此顺序提前导入带 JSI/原生注册副作用的库。
// 推荐顺序：
//   1. react-native-gesture-handler
//   2. react-native-reanimated
//   3. @shopify/react-native-skia
//
// 配合 example/metro.config.js 的 extraNodeModules + blockList 使用，
// 能彻底避免 monorepo/file: 场景下的重复模块问题：
//   - SkiaPictureView config getter undefined
//   - createAnimatedNode: Animated node already exists
//   - 其他 Fabric / ViewManager 冲突
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import '@shopify/react-native-skia';

import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

import { AppRegistry } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => RootComponent);

function RootComponent() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <App />
    </GestureHandlerRootView>
  );
}
