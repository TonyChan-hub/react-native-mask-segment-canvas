---
id: storage
title: "Storage Convention"
---

# 💾 Storage Convention

| Capability | Recommended Storage | Content |
| --- | --- | --- |
| `ref.save()` | File system | Full-res PNG path |
| `ref.session()` | MMKV / AsyncStorage | JSON metadata (URLs, paint records, brush color, etc.) |

## MaskSegmentSession Structure

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
