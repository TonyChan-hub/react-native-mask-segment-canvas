---
id: draft-recovery
title: 草稿恢复
---

# 💾 草稿恢复

```tsx
const draft = JSON.parse(mmkv.getString('paint_draft'));

<MaskSegmentCanvas
  originUrl={draft.originUrl}
  maskUrl={draft.maskUrl}
  initialSession={draft}
/>
```

使用 `ref.session()` 导出当前会话并存储在 MMKV 或 AsyncStorage 中，以便后续恢复。
