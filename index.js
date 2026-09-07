/**
 * @format
 */

import 'react-native-gesture-handler';
import 'react-native-reanimated';
import '@shopify/react-native-skia';

import { Buffer } from 'buffer';

global.Buffer = global.Buffer || Buffer;

import {AppRegistry} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import App from './App';
import {name as appName} from './app.json';

function RootComponent() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <App />
    </GestureHandlerRootView>
  );
}

AppRegistry.registerComponent(appName, () => RootComponent);
