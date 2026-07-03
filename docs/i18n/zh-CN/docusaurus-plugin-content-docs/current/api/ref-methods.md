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

## SavePaintResult

`{ filePath, width, height, paintedCount, previewPath? }`

## 代码示例

```tsx
const ref = useRef<MaskSegmentCanvasRef>(null);

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
```

> `save` 依赖于工作缓冲区和 pickMap 就绪（通常在 `interactive` 之后）；如果未就绪则抛出 `'Image not ready, cannot save'`。
