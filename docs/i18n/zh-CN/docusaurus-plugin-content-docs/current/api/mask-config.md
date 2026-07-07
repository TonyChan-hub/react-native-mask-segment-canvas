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
| `splitWallsEdgeBarrierThreshold` | `number` | `160` | 逐通道 BGR Sobel 梯度边缘屏障阈值（0 = 禁用）。可见墙面接缝 ≈ 120–280，细微光照渐变 ≈ 20–80 |
| `splitWallsCloseMaskRadius` | `number` | `3` | 组件标注前墙面遮罩孔洞（窗户、门）的形态学闭运算半径。设为 0 禁用 |
| `manualSplitWalls` | `boolean` | `false` | 为 `true` 时禁用自动纹理墙面分割，改为手动套索分区 |
| `manualSplitWallsMaxCount` | `number` | `8` | 套索定义的最大手动墙面子区域数 |
| `manualSplitWallsGapAbsorbDilatePx` | `number` | `5` | 形态学膨胀半径（分割像素），用于合并绘制多边形周围的未分配墙面薄缝 |
| `magneticLasso` | `boolean` | `false` | 为 `true` 时，套索模式使用 Sobel 梯度 + Dijkstra 最短路径进行边缘吸附 |
| `activeContourRefine` | `boolean` | `false` | 结束套索后，对每个多边形运行主动轮廓精炼，将顶点向外扩展到墙面遮罩边缘 |

启用 `splitWalls` 后，单个 `wall` 区域将被替换为多个 `wall-N` 子区域，每个子区域可独立上色和撤销。旧会话中 `regionName: 'wall'` 的记录无法映射到新的子区域名称，需重新上色。

### 手动墙面分割（套索模式）

当 `manualSplitWalls` 启用时，自动纹理墙面分割被禁用。用户必须使用 **套索（Lasso）** 功能在墙面上手动绘制多边形：

- 调用 `ref.startLasso()` 进入套索模式，然后在墙面区域点击放置多边形顶点。
- 启用 `magneticLasso` 进行边缘吸附 — 路径将沿图像强边缘走（Sobel 梯度 + Dijkstra 最短路径）。
- 启用 `activeContourRefine` 在套索完成后自动将顶点向外扩展到墙面遮罩边界。
- 调用 `ref.endLasso()` 将闭合套索多边形转换为可上色的 `wall-N` 子区域。
- 自动分割时使用 `splitWallsCloseMaskRadius` 填充墙面遮罩孔洞（窗户、门）。
- 自动分割时使用 `splitWallsEdgeBarrierThreshold` 阻止 BFS 跨越强边缘（窗框、门框）。
