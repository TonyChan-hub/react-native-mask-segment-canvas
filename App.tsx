/**
 * Mask Segment Demo App
 * 基于 OpenCV + Skia 的掩码分区交互画布
 *
 * 注意：这是库开发自测用的 Demo，直接引用 ./src。
 * 业务项目集成演示请参考 example/ 目录（使用公开包名导入）。
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import MaskSegmentCanvas, {
  type MaskSegmentCanvasRef,
  type MaskSegmentSession,
  type MaskSegmentWatchState,
  MASK_SEMANTIC_COLORS,
} from './src';
import { resolveAssetPath } from './src/utils/resolveAssetPath';
import { prewarmPngBgrCacheAsync } from './src/utils/pngImage';

const TEST_ORIGIN = require('./assets/test/origin.png');
const TEST_MASK = require('./assets/test/mask.png');

const INTERACTIVE_WATCH_STATES: MaskSegmentWatchState[] = [
  'interactive',
  'mask_paths_ready',
];

function formatWatchStatus(state: MaskSegmentWatchState | ''): string {
  if (!state) {
    return '';
  }
  if (state === 'interactive') {
    return '可上色（轮廓加载中…）';
  }
  if (state === 'mask_paths_ready') {
    return '就绪';
  }
  if (state === 'error') {
    return '失败';
  }
  return `加载中：${state}`;
}

function App(): React.JSX.Element {
  const canvasRef = useRef<MaskSegmentCanvasRef>(null);
  const [testPaths, setTestPaths] = useState<{
    origin: string;
    mask: string;
  } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [watchState, setWatchState] = useState<MaskSegmentWatchState | ''>('');
  const [sessionDraft, setSessionDraft] = useState<MaskSegmentSession | null>(
    null,
  );
  const isFullyReady = watchState === 'mask_paths_ready';
  const isInitLoading =
    testPaths != null &&
    watchState !== '' &&
    !INTERACTIVE_WATCH_STATES.includes(watchState as MaskSegmentWatchState) &&
    watchState !== 'error';

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [origin, mask] = await Promise.all([
          resolveAssetPath(TEST_ORIGIN, 'gym_test_origin.png'),
          resolveAssetPath(TEST_MASK, 'gym_test_mask.png'),
        ]);
        await prewarmPngBgrCacheAsync([origin, mask]);
        if (!cancelled) {
          setTestPaths({ origin, mask });
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        {loadError ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : testPaths ? (
          <>
            {watchState ? (
              <Text style={styles.watchText}>
                状态: {formatWatchStatus(watchState)}
                {isFullyReady ? ' · 轮播虚线已就绪' : null}
              </Text>
            ) : null}
            <View style={styles.canvasHost}>
            <MaskSegmentCanvas
              ref={canvasRef}
              originUrl={testPaths.origin}
              maskUrl={testPaths.mask}
              semanticColors={MASK_SEMANTIC_COLORS}
              regionOutlineColor="rgba(20, 120, 235, 0.58)"
              showDebugPickers
              initialSession={sessionDraft ?? undefined}
              onWatch={(state, durationMs, detail) => {
                setWatchState(state);
                if (__DEV__) {
                  const extra =
                    detail && Object.keys(detail).length > 0
                      ? ` ${JSON.stringify(detail)}`
                      : '';
                  console.log(
                    `[Demo onWatch] ${state} ${durationMs.toFixed(0)}ms${extra}`,
                  );
                }
              }}
              onPaintCallback={payload => {
                if (__DEV__) {
                  if (payload.kind === 'brush_required') {
                    console.log('[Demo onPaint]', payload.hint, payload.regionName);
                  } else {
                    console.log('[Demo onPaint]', payload.regionName, payload.color);
                  }
                }
              }}
              onError={message => {
                setLoadError(message);
                setWatchState('error');
              }}
            />
            {isInitLoading ? (
              <View style={styles.initOverlay} pointerEvents="none">
                <ActivityIndicator size="small" color="#333" />
                <Text style={styles.initOverlayText}>
                  {formatWatchStatus(watchState)}
                </Text>
              </View>
            ) : null}
            </View>
            {sessionDraft ? (
              <Text style={styles.sessionText}>
                已恢复 MMKV 草稿（{sessionDraft.painted.length} 区域）
              </Text>
            ) : null}
          </>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#333" />
            <Text style={styles.loadingText}>加载健身房测试图…</Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  errorText: {
    color: '#c33',
    fontSize: 14,
    textAlign: 'center',
  },
  watchText: {
    paddingHorizontal: 12,
    paddingTop: 8,
    color: '#555',
    fontSize: 12,
  },
  canvasHost: {
    flex: 1,
    position: 'relative',
  },
  initOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    gap: 8,
  },
  initOverlayText: {
    color: '#666',
    fontSize: 13,
  },
  sessionText: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    color: '#2a7',
    fontSize: 12,
  },
});

export default App;
