---
id: notes
title: Notes
---

# 📝 Notes

- The mask image should be a semantic color-block image with the same dimensions as the origin (black background + solid-color regions). Pixels with `max(B,G,R) < blackThreshold` (default 30) are excluded from segmentation.
- OpenCV segmentation runs on the JS thread; very large images may cause frame drops. Use `pipelineConfig.maxImageLongSide` to cap processing resolution.
- iOS photo library access requires photo permissions (only needed when `showDebugPickers` is enabled).
- `semanticColors` must match the semantic colors used in the backend/labeled mask; mismatch will cause recognition drift.
