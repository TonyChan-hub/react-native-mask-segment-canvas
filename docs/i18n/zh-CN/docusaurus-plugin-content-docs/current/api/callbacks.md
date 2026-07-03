---
id: callbacks
title: "Props：回调"
---

# 📞 Props：回调

| Prop | 签名 | 描述 |
| --- | --- | --- |
| `onWatch` | `(state, durationMs, detail?) => void` | 初始化阶段回调；`durationMs` 从本次 `init` 开始计时 |
| `onPaintCallback` | `(payload: PaintCallbackPayload) => void` | 成功上色时触发，或未选择画笔时点击区域触发 |
| `onError` | `(message, error?) => void` | 分割或加载失败 |

## PaintCallbackPayload

（可辨识联合类型，通过 `payload.kind` 区分）：

```ts
// 成功上色
{
  kind: 'painted';
  regionId: number;
  regionName: string;
  color: BgrColor;
  configJson?: Record<string, unknown>; // 来自 setPaintColor / initialPaintConfigJson
}

// 点击了有效区域但未选择画笔（未执行上色）
{
  kind: 'brush_required';
  hint: string;       // 如 "请先选择画笔颜色（底部颜色条或 ref.setPaintColor）"
  regionId: number;
  regionName: string;
}
```

示例：

```tsx
onPaintCallback={payload => {
  if (payload.kind === 'brush_required') {
    showToast(payload.hint);
    return;
  }
  savePaintRecord(payload.regionId, payload.color, payload.configJson);
}}
```

## onWatch detail（MaskSegmentWatchDetail）

| 字段 | 类型 | 描述 |
| --- | --- | --- |
| `regionCount` | `number` | 当前有效区域数 |
| `maskPathsReady` | `boolean` | 轮廓 Skia 路径是否就绪 |
| `freqLayersReady` | `boolean` | 频域 Shader 纹理是否就绪 |
| `errorMessage` | `string` | `error` 状态下的失败描述 |

### onWatch 状态流转

```
init
  → images_loaded      原始图像和遮罩读取完成
  → mask_aligned       遮罩尺寸对齐
  → mask_sampled       遮罩像素采样完成
  → regions_ready      区域提取成功
  → layers_ready       上色纹理层就绪（detail.maskPathsReady 可能仍为 false）
  → interactive        可交互（可以点击区域、选择颜色、上色）
  → mask_paths_ready   轮廓路径就绪（轮播虚线轮廓可显示；detail.maskPathsReady 为 true）
  → error              失败（detail.errorMessage 包含描述）
```

`layers_ready` / `interactive` 可能在轮廓路径计算完成之前触发。如果宿主在 `interactive` 时关闭阻塞加载器，用户已可操作；轮播虚线轮廓在 `mask_paths_ready` 后自动显示。
