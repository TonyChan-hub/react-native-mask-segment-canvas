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

When `splitWalls` is enabled, the single `wall` region is replaced by multiple `wall-N` sub-regions, each independently paintable and undoable. Old sessions with `regionName: 'wall'` cannot map to new sub-region names and must be repainted.
