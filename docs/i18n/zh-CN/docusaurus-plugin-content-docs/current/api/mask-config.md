---
id: mask-config
title: "Props：maskConfig"
---

# 🧩 Props：maskConfig

| 字段 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `semanticColors` | `MaskSemanticColor[]` | 内置调色板 | 遮罩语义颜色（可被顶层 `semanticColors` 覆盖） |
| `blackThreshold` | `number` | `30` | max(B,G,R) 低于此值的像素视为黑色背景 |
| `maxRegionColors` | `number` | `6` | 保留的最大语义区域数 |
| `quantStep` | `number` | `64` | 踢脚线量化步长 |
| `baseboardMaxColorDist` | `number` | `42` | 踢脚线颜色距离阈值 |
| `baseboardStripQuantKeys` | `string[]` | 内置键值 | 踢脚线索带量化键，格式 `"b,g,r"` |
| `wallQuantKeys` | `string[]` | 内置键值 | 墙面量化键 |
| `cabinetQuantKeys` | `string[]` | 内置键值 | 橱柜量化键 |
| `secondarySemanticNames` | `string[]` | `garageDoor, roof, eave` | 次要语义名称 |
| `secondaryMinPixelRatio` | `number` | `0.002` | 次要语义的最小像素比例 |
| `junctionHRadiusPx` | `number` | `24` | 踢脚线接缝水平半径 |
| `junctionVRadiusPx` | `number` | `2` | 踢脚线接缝垂直半径 |
| `kickBridgeHalfWPx` | `number` | `6` | 踢脚线水平间隙桥接半宽 |
| `baseboardJunctionRowMarginPx` | `number` | `1` | 踢脚线接缝行边距 |
| `baseboardJunctionVReachPx` | `number` | `2` | 踢脚线接缝垂直延伸 |
| `baseboardMinRunPx` | `number` | `2` | 遮罩条带最小运行长度 |
| `splitWalls` | `boolean` | `false` | 将墙面遮罩按纹理边界拆分为 `wall-1`、`wall-2`... |
| `splitWallsMaxCount` | `number` | `8` | 最大墙面子区域数 |
| `splitWallsMinAreaRatio` | `number` | `0.002` | 碎片最小面积比例（相对于总分割像素） |
| `splitWallsColorDistSq` | `number` | `1400` | 连通分量色度均值距离平方阈值 |
| `splitWallsChromaBlurRadius` | `number` | `5` | 保留：色度平滑半径 |
| `splitWallsNeutralChromaMax` | `number` | `14` | 白/灰墙面低色度半径；与彩色墙面的强制边界 |

启用 `splitWalls` 后，单个 `wall` 区域将被替换为多个 `wall-N` 子区域，每个子区域可独立上色和撤销。旧会话中 `regionName: 'wall'` 的记录无法映射到新的子区域名称，需重新上色。
