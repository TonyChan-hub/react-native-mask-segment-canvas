---
id: notes
title: 注意事项
---

# 📝 注意事项

- 遮罩图像应为与原始图像同尺寸的语义色块图（黑色背景 + 纯色区域）。`max(B,G,R) < blackThreshold`（默认 30）的像素将被排除在分割之外。
- OpenCV 分割在 JS 线程上运行；非常大的图像可能导致掉帧。使用 `pipelineConfig.maxImageLongSide` 限制处理分辨率。
- iOS 相册访问需要照片权限（仅在启用 `showDebugPickers` 时需要）。
- `semanticColors` 必须与后端/标注遮罩中使用的语义颜色匹配；不匹配会导致识别偏差。
