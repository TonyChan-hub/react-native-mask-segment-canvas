---
id: png-pre-warm
title: PNG 缓存预热（推荐）
---

# 🔥 PNG 缓存预热（推荐）

在挂载 Canvas 前预热 PNG 解码缓存，可节省 **100–250ms** 的初始化时间。

```tsx
import { prewarmPngBgrCacheAsync } from 'react-native-mask-segment-canvas';

async function openPaintScreen(originUrl: string, maskUrl: string) {
  await prewarmPngBgrCacheAsync([originUrl, maskUrl]);
  navigation.navigate('Paint', { originUrl, maskUrl });
}
```

在下载/提取图片后、导航到上色界面前调用 `prewarmPngBgrCacheAsync` 可获得最佳性能。
