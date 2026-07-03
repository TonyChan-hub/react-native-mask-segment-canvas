---
id: png-pre-warm
title: Pre-warm PNG Cache (Recommended)
---

# 🔥 Pre-warm PNG Cache (Recommended)

Pre-warm the PNG decode cache before mounting the canvas to save **100–250ms** on initialization.

```tsx
import { prewarmPngBgrCacheAsync } from 'react-native-mask-segment-canvas';

async function openPaintScreen(originUrl: string, maskUrl: string) {
  await prewarmPngBgrCacheAsync([originUrl, maskUrl]);
  navigation.navigate('Paint', { originUrl, maskUrl });
}
```

Call `prewarmPngBgrCacheAsync` after download/extraction and before navigating to the paint screen for the best performance.
