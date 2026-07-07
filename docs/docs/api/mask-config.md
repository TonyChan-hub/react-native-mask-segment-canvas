---
id: mask-config
title: "Props: maskConfig"
---

# 🧩 Props: maskConfig

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `semanticColors` | `MaskSemanticColor[]` | built-in palette | Mask semantic colors (overridable by top-level `semanticColors`) |
| `blackThreshold` | `number` | `30` | Pixels with max(B,G,R) below this value are treated as black background |
| `maxRegionColors` | `number` | `6` | Maximum semantic regions retained |
| `quantStep` | `number` | `64` | Baseboard quantization step |
| `baseboardMaxColorDist` | `number` | `42` | Baseboard color distance threshold |
| `baseboardStripQuantKeys` | `string[]` | built-in keys | Baseboard strip quantization keys, format `"b,g,r"` |
| `wallQuantKeys` | `string[]` | built-in keys | Wall quantization keys |
| `cabinetQuantKeys` | `string[]` | built-in keys | Cabinet quantization keys |
| `secondarySemanticNames` | `string[]` | `garageDoor, roof, eave` | Secondary semantic names |
| `secondaryMinPixelRatio` | `number` | `0.002` | Minimum pixel ratio for secondary semantics |
| `junctionHRadiusPx` | `number` | `24` | Baseboard junction horizontal radius |
| `junctionVRadiusPx` | `number` | `2` | Baseboard junction vertical radius |
| `kickBridgeHalfWPx` | `number` | `6` | Baseboard horizontal gap bridge half-width |
| `baseboardJunctionRowMarginPx` | `number` | `1` | Baseboard junction row margin |
| `baseboardJunctionVReachPx` | `number` | `2` | Baseboard junction vertical reach |
| `baseboardMinRunPx` | `number` | `2` | Minimum run length for mask strips |
| `splitWalls` | `boolean` | `false` | Split wall mask into `wall-1`, `wall-2`… by texture boundaries |
| `splitWallsMaxCount` | `number` | `8` | Max wall sub-region count |
| `splitWallsMinAreaRatio` | `number` | `0.002` | Minimum area ratio for fragments (relative to total seg pixels) |
| `splitWallsColorDistSq` | `number` | `1400` | Connected-component chroma mean distance squared threshold |
| `splitWallsChromaBlurRadius` | `number` | `5` | Reserved: chroma smoothing radius |
| `splitWallsNeutralChromaMax` | `number` | `14` | White/gray wall low-chroma radius; forced boundary from colored walls |
| `splitWallsEdgeBarrierThreshold` | `number` | `160` | Raw per-channel BGR Sobel gradient threshold for edge barriers (0 = disabled). Visible wall seams ≈ 120–280, subtle lighting gradients ≈ 20–80 |
| `splitWallsCloseMaskRadius` | `number` | `3` | Morphological close radius for wall mask holes (windows, doors) before component labeling. 0 = disable |
| `manualSplitWalls` | `boolean` | `false` | When `true`, disables automatic texture-based wall splitting. Manual lasso partitioning is used instead |
| `manualSplitWallsMaxCount` | `number` | `8` | Maximum number of manual wall sub-regions defined by lasso |
| `manualSplitWallsGapAbsorbDilatePx` | `number` | `5` | Morphological dilation radius (seg pixels) to merge thin unassigned wall pockets adjacent to the drawn polygon |
| `magneticLasso` | `boolean` | `false` | When `true`, lasso mode uses edge-snapping via Sobel gradient + Dijkstra shortest-path |
| `activeContourRefine` | `boolean` | `false` | After End Lasso, run active contour refinement on each polygon to expand vertices outward toward wall-mask edges |

When `splitWalls` is enabled, the single `wall` region is replaced by multiple `wall-N` sub-regions, each independently paintable and undoable. Old sessions with `regionName: 'wall'` cannot map to new sub-region names and must be repainted.

### Manual Wall Split (Lasso Mode)

When `manualSplitWalls` is enabled, automatic texture-based wall splitting is disabled. Instead, users must use the **Lasso** feature to manually draw polygons on the wall area:

- Call `ref.startLasso()` to enter lasso mode, then tap on wall areas to place polygon vertices.
- Enable `magneticLasso` for edge-snapping — paths will follow strong image edges (Sobel gradient + Dijkstra shortest-path).
- Enable `activeContourRefine` to automatically expand vertices outward toward the wall-mask boundary after lasso completion.
- Call `ref.endLasso()` to convert closed lasso polygons into `wall-N` sub-regions for painting.
- Use `splitWallsCloseMaskRadius` to fill wall mask holes (windows, doors) before component labeling during automatic split.
- Use `splitWallsEdgeBarrierThreshold` to prevent BFS from crossing strong edges (window frames, door frames) during automatic split.
