---
id: draft-recovery
title: Draft Recovery
---

# 💾 Draft Recovery

```tsx
const draft = JSON.parse(mmkv.getString('paint_draft'));

<MaskSegmentCanvas
  originUrl={draft.originUrl}
  maskUrl={draft.maskUrl}
  initialSession={draft}
/>
```

Use `ref.session()` to export the current session and store it in MMKV or AsyncStorage for later recovery.
