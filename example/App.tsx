/**
 * MaskSegmentCanvas 业务集成 Demo
 *
 * 本文件完全模拟真实业务项目的集成方式：
 * - 只通过 `import ... from 'react-native-mask-segment-canvas'` 使用公开 API
 * - 不依赖库的内部实现（不 import ../src）
 * - 覆盖：PNG 预热、状态管理、回调处理、Ref 操作、草稿恢复、错误处理
 *
 * 可直接复制本文件到你自己的 React Native 项目中作为参考。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import MaskSegmentCanvas, {
  type BgrColor,
  type MaskSegmentCanvasRef,
  type MaskSegmentSession,
  type MaskSegmentWatchState,
  type MaskSemanticColor,
  type PaintCallbackPayload,
  type PipelinePreset,
  type SavePaintResult,
  MASK_SEMANTIC_COLORS,
  BASEBOARD_SEMANTIC_NAME,
  DEFAULT_PIPELINE_CONFIG,
  DEFAULT_MASK_CONFIG,
  DEFAULT_PAINT_CONFIG,
  DEFAULT_INTERACTION_CONFIG,
  prewarmPngBgrCacheAsync,
  resolveAssetPath,
} from 'react-native-mask-segment-canvas';

// ============================================================================
// 测试图片 — 两组示例图，支持切换
// 业务项目接入时替换为你的图片路径（file:// 或 http(s)://）
// ============================================================================
const TEST_IMAGE_GROUPS: Array<{
  label: string;
  origin: number;
  mask: number;
  originCacheName: string;
  maskCacheName: string;
}> = [
  {
    label: '图片组 1',
    origin: require('./assets/origin.png'),
    mask: require('./assets/mask.png'),
    originCacheName: 'example_origin_g1.png',
    maskCacheName: 'example_mask_g1.png',
  },
  {
    label: '图片组 2',
    origin: require('./assets/origin-1.png'),
    mask: require('./assets/mask-1.png'),
    originCacheName: 'example_origin_g2.png',
    maskCacheName: 'example_mask_g2.png',
  },
];

// ============================================================================
// 自定义语义色表示例（健身房场景）
// ============================================================================
const GYM_CUSTOM_COLORS: MaskSemanticColor[] = [
  { name: 'wall', hex: '#4363D8', bgr: { b: 216, g: 99, r: 67 } },
  { name: 'ceiling', hex: '#3CB44B', bgr: { b: 75, g: 180, r: 60 } },
  { name: 'floor', hex: '#E6194B', bgr: { b: 75, g: 25, r: 230 } },
  { name: 'window', hex: '#F58231', bgr: { b: 49, g: 130, r: 245 } },
  { name: 'door', hex: '#911EB4', bgr: { b: 180, g: 30, r: 145 } },
  { name: 'pillar', hex: '#46F0F0', bgr: { b: 240, g: 240, r: 70 } },
];

// ============================================================================
// 预设笔刷色（底部色条之外，业务可通过 ref.setPaintColor 设置）
// ============================================================================
const PAINT_PRESETS: Array<{ label: string; color: BgrColor }> = [
  { label: '象牙白', color: { b: 200, g: 230, r: 245 } },
  { label: '米黄', color: { b: 150, g: 220, r: 245 } },
  { label: '浅灰', color: { b: 180, g: 180, r: 180 } },
  { label: '淡蓝', color: { b: 220, g: 200, r: 170 } },
];

// ============================================================================
// watchState 工具
// ============================================================================
const INTERACTIVE_STATES: MaskSegmentWatchState[] = [
  'interactive',
  'mask_paths_ready',
];

// ============================================================================
// 主页面
// ============================================================================
function App(): React.JSX.Element {
  const canvasRef = useRef<MaskSegmentCanvasRef>(null);

  // --------------------------------------------------------------------------
  // 状态
  // --------------------------------------------------------------------------
  const [imagePaths, setImagePaths] = useState<{
    origin: string;
    mask: string;
  } | null>(null);
  const [pathsError, setPathsError] = useState('');
  const [watchState, setWatchState] = useState<MaskSegmentWatchState | ''>('');
  const [watchDetail, setWatchDetail] = useState<Record<string, unknown>>({});
  const [errorMessage, setErrorMessage] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [saveResult, setSaveResult] = useState<SavePaintResult | null>(null);
  const [sessionDraft] = useState<MaskSegmentSession | null>(null);

  // Demo 模式
  const [useCustomColors, setUseCustomColors] = useState(false);
  const [splitWalls, setSplitWalls] = useState(false);
  const [pipelinePreset, setPipelinePreset] = useState<PipelinePreset>('medium');
  const [groupIndex, setGroupIndex] = useState(0);

  // --------------------------------------------------------------------------
  // 派生状态
  // --------------------------------------------------------------------------
  const isInteractive = INTERACTIVE_STATES.includes(
    watchState as MaskSegmentWatchState,
  );
  const isOutlineReady = watchState === 'mask_paths_ready';
  const isInitLoading =
    imagePaths != null &&
    watchState !== '' &&
    !INTERACTIVE_STATES.includes(watchState as MaskSegmentWatchState) &&
    watchState !== 'error';

  const semanticColors = useCustomColors ? GYM_CUSTOM_COLORS : MASK_SEMANTIC_COLORS;

  // --------------------------------------------------------------------------
  // 初始化：解析测试图路径（require → 本地 PNG 缓存路径）
  // --------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setWatchState('');
        setWatchDetail({});
        setErrorMessage('');
        setSaveResult(null);
        setPathsError('');
        setImagePaths(null);

        const group = TEST_IMAGE_GROUPS[groupIndex];
        const [origin, mask] = await Promise.all([
          resolveAssetPath(group.origin, group.originCacheName),
          resolveAssetPath(group.mask, group.maskCacheName),
        ]);
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
  }, [groupIndex]);

  // --------------------------------------------------------------------------
  // Toast 提示
  // --------------------------------------------------------------------------
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  }, []);

  // --------------------------------------------------------------------------
  // onWatch 回调
  // --------------------------------------------------------------------------
  const handleWatch = useCallback(
    (
      state: MaskSegmentWatchState,
      durationMs: number,
      detail?: Record<string, unknown>,
    ) => {
      setWatchState(state);
      if (detail) setWatchDetail(detail);
      console.log(
        `[Example onWatch] ${state}  ${durationMs.toFixed(0)}ms`,
        detail ?? '',
      );
    },
    [],
  );

  // --------------------------------------------------------------------------
  // onPaintCallback — 处理上色成功 / 未选笔刷两种场景
  // --------------------------------------------------------------------------
  const handlePaintCallback = useCallback((payload: PaintCallbackPayload) => {
    if (payload.kind === 'brush_required') {
      // 用户未选笔刷时点击了分区，业务侧弹提示引导选色
      showToast(payload.hint);
      console.log('[Example] 需选笔刷:', payload.regionName);
      return;
    }
    // 上色成功
    console.log(
      '[Example] 上色成功:',
      payload.regionName,
      `(${payload.regionId})`,
      payload.color,
    );
  }, [showToast]);

  // --------------------------------------------------------------------------
  // onError 回调
  // --------------------------------------------------------------------------
  const handleError = useCallback((message: string) => {
    setErrorMessage(message);
    setWatchState('error');
  }, []);

  // --------------------------------------------------------------------------
  // Ref 操作封装
  // --------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!isInteractive) return;
    try {
      const result = await canvasRef.current?.save();
      if (result) {
        setSaveResult(result);
        Alert.alert('保存成功', `路径: ${result.filePath}\n已上色 ${result.paintedCount} 个区域`);
      }
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : String(e));
    }
  }, [isInteractive]);

  const handleReset = useCallback(() => canvasRef.current?.reset(), []);
  const handleSwap = useCallback(() => canvasRef.current?.swap(), []);
  const handleClearAll = useCallback(() => {
    canvasRef.current?.clearAllPaint();
    showToast('已清空全部上色');
  }, [showToast]);

  const handleExportSession = useCallback(() => {
    const session = canvasRef.current?.session();
    if (session) {
      console.log('[Example] 会话快照:', JSON.stringify(session, null, 2));
      Alert.alert(
        '会话快照',
        `已上色 ${session.painted.length} 个区域\n可存入 MMKV / AsyncStorage 实现草稿恢复`,
      );
    }
  }, []);

  const handleSetPaintColor = useCallback(
    (color: BgrColor, label: string) => {
      canvasRef.current?.setPaintColor(color, { preset: label });
      showToast(`已选择笔刷: ${label}`);
    },
    [showToast],
  );

  // --------------------------------------------------------------------------
  // 渲染：错误 / 加载 / 就绪
  // --------------------------------------------------------------------------
  if (pathsError) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.errorText}>图片加载失败</Text>
          <Text style={styles.errorDetail}>{pathsError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!imagePaths) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4363D8" />
          <Text style={styles.loadingText}>正在预热 PNG 缓存…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* 顶部：状态 + 模式切换 */}
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <Text style={styles.statusLabel}>
            状态:{' '}
            <Text
              style={[
                styles.statusValue,
                isInteractive && styles.statusReady,
                watchState === 'error' && styles.statusError,
              ]}
            >
              {watchState || '初始化…'}
            </Text>
            {isOutlineReady ? ' · 轮播就绪' : ''}
            {isInteractive && !isOutlineReady ? ' · 轮廓加载中' : ''}
          </Text>
          <Text style={styles.regionCount}>
            {watchDetail.regionCount != null
              ? `${watchDetail.regionCount} 个分区`
              : ''}
          </Text>
        </View>

        {/* 模式切换 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.modeRow}
          contentContainerStyle={styles.modeRowContent}
        >
          <TouchableOpacity
            style={[styles.modeChip, !useCustomColors && styles.modeChipActive]}
            onPress={() => setUseCustomColors(false)}
          >
            <Text style={[styles.modeChipText, !useCustomColors && styles.modeChipTextActive]}>
              默认色表
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeChip, useCustomColors && styles.modeChipActive]}
            onPress={() => setUseCustomColors(true)}
          >
            <Text style={[styles.modeChipText, useCustomColors && styles.modeChipTextActive]}>
              自定义色表
            </Text>
          </TouchableOpacity>
          <Text style={styles.modeDivider}>|</Text>
          {TEST_IMAGE_GROUPS.map((group, idx) => (
            <TouchableOpacity
              key={group.label}
              style={[styles.modeChip, groupIndex === idx && styles.modeChipActive]}
              onPress={() => setGroupIndex(idx)}
            >
              <Text style={[styles.modeChipText, groupIndex === idx && styles.modeChipTextActive]}>
                {group.label}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.modeDivider}>|</Text>
          {(['low', 'medium', 'high'] as PipelinePreset[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.modeChip, pipelinePreset === p && styles.modeChipActive]}
              onPress={() => setPipelinePreset(p)}
            >
              <Text style={[styles.modeChipText, pipelinePreset === p && styles.modeChipTextActive]}>
                {p === 'low' ? '低精度' : p === 'medium' ? '中精度' : '高精度'}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.modeDivider}>|</Text>
          <TouchableOpacity
            style={[styles.modeChip, splitWalls && styles.modeChipActive]}
            onPress={() => setSplitWalls(v => !v)}
          >
            <Text style={[styles.modeChipText, splitWalls && styles.modeChipTextActive]}>
              墙壁细分
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 画布 */}
      <View style={styles.canvasHost}>
        <MaskSegmentCanvas
          key={`image-group-${groupIndex}-split-${splitWalls ? 1 : 0}`}
          ref={canvasRef}
          style={styles.canvas}
          originUrl={imagePaths.origin}
          maskUrl={imagePaths.mask}
          semanticColors={semanticColors}
          regionOutlineColor="rgba(20, 120, 235, 0.58)"
          pipelinePreset={pipelinePreset}
          maskConfig={{
            ...DEFAULT_MASK_CONFIG,
            maxRegionColors: 6,
            splitWalls,
          }}
          paintConfig={{
            ...DEFAULT_PAINT_CONFIG,
            colorBaseOpacity: 0.88,
          }}
          interactionConfig={{
            ...DEFAULT_INTERACTION_CONFIG,
            initRegionFlashMs: 1000,
            enableInitRegionFlash: true,
          }}
          disabled={!isInteractive}
          initialSession={sessionDraft ?? undefined}
          onWatch={handleWatch}
          onPaintCallback={handlePaintCallback}
          onError={handleError}
        />

        {/* 初始化加载遮罩 */}
        {isInitLoading && (
          <View style={styles.initOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color="#4363D8" />
            <Text style={styles.initOverlayText}>
              初始化中：{watchState}
            </Text>
          </View>
        )}
      </View>

      {/* Toast */}
      {toastMessage ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      ) : null}

      {/* 底部：业务操作栏 / Ref 方法演示 */}
      <View style={styles.bottomBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bottomBarContent}
        >
          {/* 预设笔刷（替代底部色条） */}
          <Text style={styles.sectionLabel}>预设笔刷:</Text>
          {PAINT_PRESETS.map(p => (
            <TouchableOpacity
              key={p.label}
              style={[styles.paintBtn, { backgroundColor: `rgb(${p.color.r},${p.color.g},${p.color.b})` }]}
              onPress={() => handleSetPaintColor(p.color, p.label)}
              disabled={!isInteractive}
            >
              <Text style={styles.paintBtnText}>{p.label}</Text>
            </TouchableOpacity>
          ))}

          <View style={styles.divider} />

          {/* Ref 操作 */}
          <Text style={styles.sectionLabel}>操作:</Text>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={handleReset}
            disabled={!isInteractive}
          >
            <Text style={styles.actionBtnText}>撤销</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleSwap}
            disabled={!isInteractive}
          >
            <Text style={styles.actionBtnText}>对比</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleClearAll}
            disabled={!isInteractive}
          >
            <Text style={styles.actionBtnText}>清空</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={handleSave}
            disabled={!isInteractive}
          >
            <Text style={styles.actionBtnTextPrimary}>保存</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleExportSession}
            disabled={!isInteractive}
          >
            <Text style={styles.actionBtnText}>导出会话</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 错误展示 */}
      {errorMessage ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorBarText}>错误: {errorMessage}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ============================================================================
// 样式
// ============================================================================
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
    color: '#888',
    fontSize: 14,
  },
  errorText: {
    color: '#c33',
    fontSize: 18,
    fontWeight: '600',
  },
  errorDetail: {
    marginTop: 8,
    color: '#999',
    fontSize: 13,
    textAlign: 'center',
  },

  // 顶部状态栏
  topBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8e8',
    backgroundColor: '#fafafa',
  },
  topBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    color: '#888',
  },
  statusValue: {
    fontWeight: '600',
    color: '#555',
  },
  statusReady: {
    color: '#2a7',
  },
  statusError: {
    color: '#c33',
  },
  regionCount: {
    fontSize: 11,
    color: '#aaa',
  },
  modeRow: {
    marginTop: 6,
  },
  modeRowContent: {
    alignItems: 'center',
    gap: 6,
  },
  modeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#eee',
  },
  modeChipActive: {
    backgroundColor: '#4363D8',
  },
  modeChipText: {
    fontSize: 11,
    color: '#666',
  },
  modeChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  modeDivider: {
    color: '#ddd',
    fontSize: 11,
    marginHorizontal: 2,
  },

  // 画布
  canvasHost: {
    flex: 1,
    position: 'relative',
    height: 280,
  },
  canvas: {
    flex: 1,
  },
  initOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    gap: 8,
  },
  initOverlayText: {
    color: '#888',
    fontSize: 13,
  },

  // Toast
  toast: {
    position: 'absolute',
    top: 120,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 999,
  },
  toastText: {
    backgroundColor: 'rgba(0,0,0,0.78)',
    color: '#fff',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },

  // 底部操作栏
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8e8e8',
    backgroundColor: '#fafafa',
    paddingVertical: 8,
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 4,
  },

  // 笔刷按钮
  paintBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ddd',
  },
  paintBtnText: {
    fontSize: 11,
    color: '#333',
    fontWeight: '600',
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // 操作按钮
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  actionBtnPrimary: {
    backgroundColor: '#4363D8',
    borderColor: '#4363D8',
  },
  actionBtnDanger: {
    borderColor: '#e88',
  },
  actionBtnText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },
  actionBtnTextPrimary: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },

  // 错误条
  errorBar: {
    backgroundColor: '#fff0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#fcc',
  },
  errorBarText: {
    fontSize: 12,
    color: '#c33',
  },
});

export default function Root(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  );
}
