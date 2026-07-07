/**
 * MaskSegmentCanvas business integration demo
 *
 * This file fully simulates the integration method of a real business project:
 * - Only use public API through `import ... from 'react-native-mask-segment-canvas'`
 * - Do not depend on the internal implementation of the library (do not import ../src)
 * - Overlay: PNG preheating, status management, callback processing, Ref operations, draft recovery, error handling
 *
 * You can directly copy this file to your own React Native project as a reference.
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
  type ManualWallPartition,
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
// test images — two sets of example images, support switching
// replace your image path (file:// or http(s)://) when integrating into your business project
// ============================================================================
const TEST_IMAGE_GROUPS: Array<{
  label: string;
  origin: number;
  mask: number;
  originCacheName: string;
  maskCacheName: string;
}> = [
  {
    label: 'picture group 1',
    origin: require('./assets/origin.png'),
    mask: require('./assets/mask.png'),
    originCacheName: 'example_origin_g1.png',
    maskCacheName: 'example_mask_g1.png',
  },
  {
    label: 'picture group 2',
    origin: require('./assets/origin-1.png'),
    mask: require('./assets/mask-1.png'),
    originCacheName: 'example_origin_g2.png',
    maskCacheName: 'example_mask_g2.png',
  },
];

// ============================================================================
// custom semantic colors example (gym scene)
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
// preset brush colors (outside the bottom color bar, business can set through ref.setPaintColor)
// ============================================================================
const PAINT_PRESETS: Array<{ label: string; color: BgrColor }> = [
  { label: 'Ivory white', color: { b: 200, g: 230, r: 245 } },
  { label: 'Yellow', color: { b: 150, g: 220, r: 245 } },
  { label: 'Light gray', color: { b: 180, g: 180, r: 180 } },
  { label: 'Light blue', color: { b: 220, g: 200, r: 170 } },
];

// ============================================================================
// watchState tools
// ============================================================================
const INTERACTIVE_STATES: MaskSegmentWatchState[] = [
  'interactive',
  'mask_paths_ready',
];

// ============================================================================
// main page
// ============================================================================
function App(): React.JSX.Element {
  const canvasRef = useRef<MaskSegmentCanvasRef>(null);

  // --------------------------------------------------------------------------
  // State
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

  // Demo mode
  const [useCustomColors, setUseCustomColors] = useState(false);
  const [splitWalls, setSplitWalls] = useState(false);
  const [manualSplitWalls, setManualSplitWalls] = useState(false);
  const [magneticLasso, setMagneticLasso] = useState(false);
  const [activeContourRefine, setActiveContourRefine] = useState(false);
  const [splitEdgeBarrier, setSplitEdgeBarrier] = useState(false);
  const [isLassoing, setIsLassoing] = useState(false);
  const [pipelinePreset, setPipelinePreset] = useState<PipelinePreset>('medium');
  const [groupIndex, setGroupIndex] = useState(0);

  // --------------------------------------------------------------------------
  // derived state
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
  // Init: resolve test image paths (require → local PNG cache path)
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
  // Toast message
  // --------------------------------------------------------------------------
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  }, []);

  // --------------------------------------------------------------------------
  // onWatch callback
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
  // onPaintCallback — handle paint success / brush not selected two scenarios
  // --------------------------------------------------------------------------
  const handlePaintCallback = useCallback((payload: PaintCallbackPayload) => {
    if (payload.kind === 'brush_required') {
      // user did not select a brush, the business side pops up a prompt to guide selection of color
      showToast(payload.hint);
      console.log('[Example] Need to select a brush:', payload.regionName);
      return;
    }
    // paint success
    console.log(
      '[Example] Paint success:',
      payload.regionName,
      `(${payload.regionId})`,
      payload.color,
    );
  }, [showToast]);

  // --------------------------------------------------------------------------
  // onError callback
  // --------------------------------------------------------------------------
  const handleError = useCallback((message: string) => {
    setErrorMessage(message);
    setWatchState('error');
  }, []);

  // --------------------------------------------------------------------------
  // Ref operations encapsulation
  // --------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!isInteractive) return;
    try {
      const result = await canvasRef.current?.save();
      if (result) {
        setSaveResult(result);
        Alert.alert('Save success', `Path: ${result.filePath}\nPainted ${result.paintedCount} regions`);
      }
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    }
  }, [isInteractive]);

  const handleReset = useCallback(() => canvasRef.current?.reset(), []);
  const handleSwap = useCallback(() => canvasRef.current?.swap(), []);
  const handleClearAll = useCallback(() => {
    canvasRef.current?.clearAllPaint();
    showToast('All paint cleared');
  }, [showToast]);

  const handleExportSession = useCallback(() => {
    const session = canvasRef.current?.session();
    if (session) {
      console.log('[Example] Session snapshot:', JSON.stringify(session, null, 2));
      Alert.alert(
        'Session snapshot',
        `Painted ${session.painted.length} regions\nCan be stored in MMKV / AsyncStorage to implement draft recovery`,
      );
    }
  }, []);

  const handleSetPaintColor = useCallback(
    (color: BgrColor, label: string) => {
      canvasRef.current?.setPaintColor(color, { preset: label });
      showToast(`Selected brush: ${label}`);
    },
    [showToast],
  );

  const handleStartLasso = useCallback(() => {
    canvasRef.current?.startLasso();
    setIsLassoing(true);
    showToast('Lasso mode: tap wall area to place vertices');
  }, [showToast]);

  const handleEndLasso = useCallback(() => {
    const parts = canvasRef.current?.endLasso();
    setIsLassoing(false);
    if (parts && parts.length > 0) {
      showToast(`Lasso ended: ${parts.length} wall sub-regions created`);
      console.log(
        '[Example] Manual wall partitions:',
        JSON.stringify(
          parts.map(p => ({ id: p.id, regionName: p.regionName, area: p.area })),
          null,
          2,
        ),
      );
    } else {
      showToast('Lasso ended (no polygons to convert)');
    }
  }, [showToast]);

  const handleCancelLasso = useCallback(() => {
    canvasRef.current?.cancelLasso();
    setIsLassoing(false);
    showToast('Lasso cancelled (regions not saved)');
  }, [showToast]);

  const handleDeleteLasso = useCallback(() => {
    const parts = canvasRef.current?.getManualRegions();
    if (!parts || parts.length === 0) {
      showToast('No lasso polygons to delete');
      return;
    }
    const last = parts[parts.length - 1];
    canvasRef.current?.deleteLasso(last.id);
    showToast(`Deleted lasso: ${last.regionName}`);
  }, [showToast]);

  const handleGetLassoRegions = useCallback(() => {
    const parts = canvasRef.current?.getManualRegions();
    if (!parts || parts.length === 0) {
      Alert.alert('Manual Regions', 'No manual wall partitions available.');
      return;
    }
    const summary = parts
      .map(
        (p: ManualWallPartition) =>
          `  ${p.regionName}: area=${p.area}, bbox=(${p.bbox.x},${p.bbox.y} ${p.bbox.w}x${p.bbox.h})`,
      )
      .join('\n');
    Alert.alert('Manual Wall Partitions', `${parts.length} regions:\n${summary}`);
    console.log(
      '[Example] getManualRegions:',
      JSON.stringify(
        parts.map(p => ({
          id: p.id,
          regionId: p.regionId,
          regionName: p.regionName,
          area: p.area,
          bbox: p.bbox,
          vertexCount: p.vertices.length,
        })),
        null,
        2,
      ),
    );
  }, []);

  // --------------------------------------------------------------------------
  // render: error / loading / ready
  // --------------------------------------------------------------------------
  if (pathsError) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Image loading failed</Text>
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
          <Text style={styles.loadingText}>Preheating PNG cache…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* top: status + mode switch */}
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <Text style={styles.statusLabel}>
            Status:{' '}
            <Text
              style={[
                styles.statusValue,
                isInteractive && styles.statusReady,
                watchState === 'error' && styles.statusError,
              ]}
            >
              {watchState || 'Initializing…'}
            </Text>
            {isOutlineReady ? ' · Carousel ready' : ''}
            {isInteractive && !isOutlineReady ? ' · Outline loading' : ''}
          </Text>
          <Text style={styles.regionCount}>
            {watchDetail.regionCount != null
              ? `${watchDetail.regionCount} partitions`
              : ''}
          </Text>
        </View>

        {/* mode switch */}
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
              Default color palette
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeChip, useCustomColors && styles.modeChipActive]}
            onPress={() => setUseCustomColors(true)}
          >
            <Text style={[styles.modeChipText, useCustomColors && styles.modeChipTextActive]}>
              Custom color palette
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
                {p === 'low' ? 'Low precision' : p === 'medium' ? 'Medium precision' : 'High precision'}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.modeDivider}>|</Text>
          <TouchableOpacity
            style={[styles.modeChip, splitWalls && styles.modeChipActive]}
            onPress={() => setSplitWalls(v => !v)}
          >
            <Text style={[styles.modeChipText, splitWalls && styles.modeChipTextActive]}>
              (split walls)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeChip, manualSplitWalls && styles.modeChipActive]}
            onPress={() => {
              setManualSplitWalls(v => !v);
              if (!manualSplitWalls) {
                setSplitWalls(false);
              }
            }}
          >
            <Text style={[styles.modeChipText, manualSplitWalls && styles.modeChipTextActive]}>
              (manual split)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeChip, magneticLasso && styles.modeChipLassoActive]}
            onPress={() => {
              setMagneticLasso(v => !v);
              if (!magneticLasso) {
                setManualSplitWalls(true);
              }
            }}
          >
            <Text style={[styles.modeChipText, magneticLasso && styles.modeChipTextActive]}>
              (magnetic)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeChip, activeContourRefine && styles.modeChipLassoActive]}
            onPress={() => {
              setActiveContourRefine(v => !v);
              if (!activeContourRefine) {
                setManualSplitWalls(true);
              }
            }}
          >
            <Text style={[styles.modeChipText, activeContourRefine && styles.modeChipTextActive]}>
              (contour)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeChip, splitEdgeBarrier && styles.modeChipActive]}
            onPress={() => {
              setSplitEdgeBarrier(v => !v);
              if (!splitEdgeBarrier) {
                setSplitWalls(true);
              }
            }}
          >
            <Text style={[styles.modeChipText, splitEdgeBarrier && styles.modeChipTextActive]}>
              (edge barrier)
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* canvas */}
      <View style={styles.canvasHost}>
        <MaskSegmentCanvas
          key={`image-group-${groupIndex}-split-${splitWalls ? 1 : 0}-manual-${manualSplitWalls ? 1 : 0}-magnetic-${magneticLasso ? 1 : 0}-contour-${activeContourRefine ? 1 : 0}-ebarrier-${splitEdgeBarrier ? 1 : 0}`}
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
            manualSplitWalls,
            manualSplitWallsMaxCount: 8,
            magneticLasso,
            activeContourRefine,
            splitWallsEdgeBarrierThreshold: splitEdgeBarrier ? 160 : 0,
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

        {/* initialization loading mask */}
        {isInitLoading && (
          <View style={styles.initOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color="#4363D8" />
            <Text style={styles.initOverlayText}>
              Initializing: {watchState}
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

      {/* bottom: business operation bar / Ref method demonstration */}
      <View style={styles.bottomBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bottomBarContent}
        >
          {/* preset brush (replace bottom color bar) */}
          <Text style={styles.sectionLabel}>Preset brush:</Text>
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

          {/* Ref operations */}
          <Text style={styles.sectionLabel}>Operations:</Text>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={handleReset}
            disabled={!isInteractive}
          >
            <Text style={styles.actionBtnText}>Undo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleSwap}
            disabled={!isInteractive}
          >
            <Text style={styles.actionBtnText}>Compare</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleClearAll}
            disabled={!isInteractive}
          >
            <Text style={styles.actionBtnText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={handleSave}
            disabled={!isInteractive}
          >
            <Text style={styles.actionBtnTextPrimary}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleExportSession}
            disabled={!isInteractive}
          >
            <Text style={styles.actionBtnText}>Export session</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Lasso operations */}
          <Text style={styles.sectionLabel}>Lasso:</Text>
          <TouchableOpacity
            style={[styles.actionBtn, isLassoing && styles.actionBtnLassoActive]}
            onPress={handleStartLasso}
            disabled={!isInteractive || !manualSplitWalls || isLassoing}
          >
            <Text style={styles.actionBtnText}>Start Lasso</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={handleEndLasso}
            disabled={!isInteractive || !manualSplitWalls || !isLassoing}
          >
            <Text style={styles.actionBtnTextPrimary}>End Lasso</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={handleCancelLasso}
            disabled={!isInteractive || !manualSplitWalls || !isLassoing}
          >
            <Text style={styles.actionBtnText}>Cancel Lasso</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={handleDeleteLasso}
            disabled={!isInteractive || !manualSplitWalls}
          >
            <Text style={styles.actionBtnText}>Del Lasso</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleGetLassoRegions}
            disabled={!isInteractive || !manualSplitWalls}
          >
            <Text style={styles.actionBtnText}>Get Regions</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* error display */}
      {errorMessage ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorBarText}>Error: {errorMessage}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ============================================================================
// styles
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

  // top status bar
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
  modeChipLassoActive: {
    backgroundColor: '#00C853',
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

  // canvas
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

  // bottom operation bar
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

  // brush button
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

  // operation button
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
  actionBtnLassoActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
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

  // error bar
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
