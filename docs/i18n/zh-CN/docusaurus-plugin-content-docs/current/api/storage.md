---
id: storage
title: "存储约定"
---

# 💾 存储约定

| 能力 | 推荐存储 | 内容 |
| --- | --- | --- |
| `ref.save()` | 文件系统 | 全分辨率 PNG 路径 |
| `ref.session()` | MMKV / AsyncStorage | JSON 元数据（URL、上色记录、画笔颜色等） |

## MaskSegmentSession 结构

```ts
{
  version: 1;
  originUrl: string;
  maskUrl: string;
  painted: PaintedRegionRecord[];  // { regionId, regionName, color, configJson? }
  paintHistory: number[];
  currentColor?: BgrColor;
  currentColorConfigJson?: Record<string, unknown>;
  savedAt: number;
}
```
