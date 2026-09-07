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
  FlatList,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
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
// test images
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
  {
    label: 'picture group 3',
    origin: require('./assets/origin-2.png'),
    mask: require('./assets/mask-2.png'),
    originCacheName: 'example_origin_g3.png',
    maskCacheName: 'example_mask_g3.png',
  },
  {
    label: 'picture group 4',
    origin: require('./assets/origin-3.png'),
    mask: require('./assets/mask-3.png'),
    originCacheName: 'example_origin_g4.png',
    maskCacheName: 'example_mask_g4.png',
  },
  {
    label: 'picture group 5',
    origin: require('./assets/origin-4.png'),
    mask: require('./assets/mask-4.png'),
    originCacheName: 'example_origin_g5.png',
    maskCacheName: 'example_mask_g5.png',
  },
  {
    label: 'picture group 6',
    origin: require('./assets/origin-5.png'),
    mask: require('./assets/mask-5.png'),
    originCacheName: 'example_origin_g6.png',
    maskCacheName: 'example_mask_g6.png',
  },
  {
    label: 'picture group 7',
    origin: require('./assets/origin-6.png'),
    mask: require('./assets/mask-6.png'),
    originCacheName: 'example_origin_g7.png',
    maskCacheName: 'example_mask_g7.png',
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
// preset brush colors
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
// reusable dropdown components
// ============================================================================

type DropdownOption<T> = { label: string; value: T };

/** Selection dropdown — pick one value from a list */
function DropdownSelector<T extends string | number | boolean>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: DropdownOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <>
      <TouchableOpacity
        style={styles.dropdownBtn}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.dropdownBtnText}>
          {label ? `${label}: ` : ''}{selected?.label ?? '...'} ▾
        </Text>
      </TouchableOpacity>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.dropdownOverlay}>
            <View style={styles.dropdownList}>
              <FlatList
                data={options}
                keyExtractor={item => String(item.value)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.dropdownItem, item.value === value && styles.dropdownItemActive]}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        item.value === value && styles.dropdownItemTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

type DropdownActionItem = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
};

/** Action dropdown — trigger actions from a list */
function DropdownActions({
  label,
  items,
}: {
  label: string;
  items: DropdownActionItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        style={styles.dropdownBtn}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.dropdownBtnText}>{label} ▾</Text>
      </TouchableOpacity>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.dropdownOverlay}>
            <View style={styles.dropdownList}>
              {items.map((item, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.dropdownItem,
                    item.danger && styles.dropdownItemDanger,
                    item.active && styles.dropdownItemActive,
                  ]}
                  onPress={() => {
                    if (!item.disabled) {
                      item.onPress();
                      setOpen(false);
                    }
                  }}
                  disabled={item.disabled}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      item.disabled && styles.dropdownItemTextDisabled,
                      item.danger && styles.dropdownItemTextDanger,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

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
  // onPaintCallback
  // --------------------------------------------------------------------------
  const handlePaintCallback = useCallback((payload: PaintCallbackPayload) => {
    if (payload.kind === 'brush_required') {
      showToast(payload.hint);
      console.log('[Example] Need to select a brush:', payload.regionName);
      return;
    }
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
  // dropdown option presets
  // --------------------------------------------------------------------------
  const paletteOptions: DropdownOption<string>[] = [
    { label: 'Default palette', value: 'default' },
    { label: 'Custom palette', value: 'custom' },
  ];

  const imageOptions: DropdownOption<number>[] = TEST_IMAGE_GROUPS.map((g, i) => ({
    label: g.label,
    value: i,
  }));

  const pipelineOptions: DropdownOption<PipelinePreset>[] = [
    { label: 'Low precision', value: 'low' },
    { label: 'Medium precision', value: 'medium' },
    { label: 'High precision', value: 'high' },
  ];

  const onOffOptions: DropdownOption<boolean>[] = [
    { label: 'Off', value: false },
    { label: 'On', value: true },
  ];

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

        <View style={styles.modeRow}>
          <DropdownSelector
            options={paletteOptions}
            value={useCustomColors ? 'custom' : 'default'}
            onChange={v => setUseCustomColors(v === 'custom')}
          />
          <DropdownSelector
            options={imageOptions}
            value={groupIndex}
            onChange={setGroupIndex}
          />
          <DropdownSelector
            options={pipelineOptions}
            value={pipelinePreset}
            onChange={setPipelinePreset}
          />
          <DropdownSelector
            label="Split walls"
            options={onOffOptions}
            value={splitWalls}
            onChange={setSplitWalls}
          />
          <DropdownSelector
            label="Manual split"
            options={onOffOptions}
            value={manualSplitWalls}
            onChange={v => {
              setManualSplitWalls(v);
              if (!v) setSplitWalls(false);
            }}
          />
          <DropdownSelector
            label="Magnetic"
            options={onOffOptions}
            value={magneticLasso}
            onChange={v => {
              setMagneticLasso(v);
              if (v) setManualSplitWalls(true);
            }}
          />
          <DropdownSelector
            label="Contour"
            options={onOffOptions}
            value={activeContourRefine}
            onChange={v => {
              setActiveContourRefine(v);
              if (v) setManualSplitWalls(true);
            }}
          />
          <DropdownSelector
            label="Edge barrier"
            options={onOffOptions}
            value={splitEdgeBarrier}
            onChange={v => {
              setSplitEdgeBarrier(v);
              if (v) setSplitWalls(true);
            }}
          />
        </View>
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
            enableRegionGuideDots: true,
          }}
          disabled={!isInteractive}
          initialSession={sessionDraft ?? undefined}
          onWatch={handleWatch}
          onPaintCallback={handlePaintCallback}
          onError={handleError}
        />

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

      {/* bottom: operation bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomBarContent}>
          <DropdownActions
            label="Preset Brush"
            items={PAINT_PRESETS.map(p => ({
              label: p.label,
              onPress: () => handleSetPaintColor(p.color, p.label),
              disabled: !isInteractive,
            }))}
          />

          <DropdownActions
            label="Operations"
            items={[
              { label: 'Undo', onPress: handleReset, disabled: !isInteractive, danger: true },
              { label: 'Compare', onPress: handleSwap, disabled: !isInteractive },
              { label: 'Clear', onPress: handleClearAll, disabled: !isInteractive },
              { label: 'Save', onPress: handleSave, disabled: !isInteractive },
              { label: 'Export session', onPress: handleExportSession, disabled: !isInteractive },
            ]}
          />

          <DropdownActions
            label="Lasso"
            items={[
              { label: 'Start Lasso', onPress: handleStartLasso, disabled: !isInteractive || !manualSplitWalls || isLassoing, active: isLassoing },
              { label: 'End Lasso', onPress: handleEndLasso, disabled: !isInteractive || !manualSplitWalls || !isLassoing },
              { label: 'Cancel Lasso', onPress: handleCancelLasso, disabled: !isInteractive || !manualSplitWalls || !isLassoing, danger: true },
              { label: 'Delete Lasso', onPress: handleDeleteLasso, disabled: !isInteractive || !manualSplitWalls, danger: true },
              { label: 'Get Regions', onPress: handleGetLassoRegions, disabled: !isInteractive || !manualSplitWalls },
            ]}
          />
        </View>
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
    paddingBottom: 8,
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },

  // dropdown (shared)
  dropdownBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#4363D8',
  },
  dropdownBtnText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownList: {
    width: 200,
    maxHeight: 300,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  dropdownItemActive: {
    backgroundColor: '#eef1ff',
  },
  dropdownItemDanger: {
    backgroundColor: '#fff5f5',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#333',
  },
  dropdownItemTextActive: {
    color: '#4363D8',
    fontWeight: '600',
  },
  dropdownItemTextDisabled: {
    color: '#ccc',
  },
  dropdownItemTextDanger: {
    color: '#c33',
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
    gap: 10,
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
