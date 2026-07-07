---
id: ref-methods
title: "Ref 方法"
---

# 🔧 Ref 方法

通过 `ref` 访问（类型 `MaskSegmentCanvasRef`）：

| 方法 | 签名 | 描述 |
| --- | --- | --- |
| `reset` | `() => void` | 撤销上一步上色操作（按 `paintHistory`） |
| `swap` | `(showOrigin?: boolean) => void` | 切换原始图像对比；省略参数则切换，`true`/`false` 强制设置 |
| `save` | `(options?) => Promise<SavePaintResult>` | 合成并保存 PNG；`options.destDir` 可选输出目录 |
| `session` | `() => MaskSegmentSession` | 导出 JSON 可序列化会话（用于 MMKV 存储） |
| `loadSession` | `(session) => void` | 恢复上色状态（也可通过 `initialSession` 使用） |
| `setPaintColor` | `(color, configJson?) => void` | 设置当前画笔颜色；清除底部颜色条选中状态 |
| `setMaskConfig` | `(config) => void` | 运行时更新遮罩配置并 **重新分割** |
| `clearAllPaint` | `() => void` | 清除所有上色记录 |
| `resegment` | `() => Promise<void>` | 清除 PNG 缓存并重新分割 |
| `getRegions` | `() => SegmentRegion[]` | 当前区域列表快照 |
| `getPaintedRegions` | `() => PaintedRegionRecord[]` | 当前上色记录快照 |
| `getLastExport` | `() => SavePaintResult \| null` | 返回最近一次自动导出或 `save()` 的结果（如有） |
| `startLasso` | `() => void` | 进入套索模式 — 用户可在墙面区域点击放置多边形顶点 |
| `endLasso` | `() => ManualWallPartition[]` | 退出套索模式，将所有闭合套索多边形转换为可上色的 `wall-X` 子区域 |
| `cancelLasso` | `() => void` | 退出当前套索编辑会话，不保存区域 |
| `getManualRegions` | `() => ManualWallPartition[]` | 获取当前手动墙面分区（仅在 `endLasso` 调用后有效） |
| `deleteLasso` | `(id: string) => void` | 根据 id 删除套索多边形。已提交的分区也会删除该区域上的上色 |

## SavePaintResult

`{ filePath, width, height, paintedCount, previewPath? }`

## ManualWallPartition

`{ id, regionId, regionName, vertices, bbox, area }`

由 `endLasso()` 和 `getManualRegions()` 返回。每个分区将一个套索多边形映射到一个 `wall-N` 子区域。

## 代码示例

```tsx
const ref = useRef<MaskSegmentCanvasRef>(null);

// 上色操作
ref.current?.reset();
ref.current?.swap();           // 切换
ref.current?.swap(true);       // 强制显示原始图像

const result = await ref.current?.save({ destDir: '/path/to/dir' });

const session = ref.current?.session();
ref.current?.loadSession(session);

ref.current?.setPaintColor({ b: 100, g: 120, r: 140 }, { sku: 'paint-001' });
ref.current?.setMaskConfig({ semanticColors: customColors });

ref.current?.clearAllPaint();
await ref.current?.resegment();

const regions = ref.current?.getRegions();
const painted = ref.current?.getPaintedRegions();

// 套索操作
ref.current?.startLasso();                // 进入套索模式
// ... 用户在墙面区域点击放置顶点 ...
const partitions = ref.current?.endLasso();  // 将多边形转换为 wall-N 区域
ref.current?.cancelLasso();               // 丢弃进行中的套索

const manualRegions = ref.current?.getManualRegions();
ref.current?.deleteLasso('lasso_1');      // 删除指定多边形
```

> `save` 依赖于工作缓冲区和 pickMap 就绪（通常在 `interactive` 之后）；如果未就绪则抛出 `'Image not ready, cannot save'`。
