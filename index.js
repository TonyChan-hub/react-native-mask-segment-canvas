/**
 * @format
 */

// 【关键】在入口最顶部、任何其他代码之前按顺序导入这些包。
// 顺序推荐：gesture-handler → reanimated → skia
// 目的：确保 JSI / Fabric 组件的 install 和注册只在“正确单例”上执行一次。
// 缺失或顺序错误 + 重复模块解析 → 各种类似错误：
//   SkiaPictureView must be a function (undefined)
//   createAnimatedNode: Animated node already exists
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import '@shopify/react-native-skia';

import { Buffer } from 'buffer';

global.Buffer = global.Buffer || Buffer;

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
