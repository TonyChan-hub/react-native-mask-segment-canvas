---
id: pipeline-config
title: "Props：pipelineConfig"
---

# 🔬 Props：pipelineConfig

| 字段 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `maxImageLongSide` | `number` | `720` | 分割 / pickMap / 工作区域缩放的最大长边 |
| `paintFreqMaxLongSide` | `number` | `480` | OpenCV LAB 频域层的最大长边 |
| `originPreviewMaxLongSide` | `number` | `360` | 预览最大长边（主路径使用工作分辨率） |
| `maskPathMaxLongSide` | `number` | `480` | 轮廓路径下采样的最大长边 |
| `minContourArea` | `number` | `100` | 最小轮廓面积（按分辨率比例缩放） |
| `contourApproxEpsilon` | `number` | `0.003` | 轮廓多边形近似系数 |
| `maxRegions` | `number` | `500` | 分割期间的最大区域数 |
