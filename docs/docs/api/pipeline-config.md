---
id: pipeline-config
title: "Props: pipelineConfig"
---

# 🔬 Props: pipelineConfig

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `maxImageLongSide` | `number` | `720` | Maximum long side for segmentation / pickMap / working area scaling |
| `paintFreqMaxLongSide` | `number` | `480` | Maximum long side for OpenCV LAB frequency layers |
| `originPreviewMaxLongSide` | `number` | `360` | Maximum long side for preview (main path uses working resolution) |
| `maskPathMaxLongSide` | `number` | `480` | Maximum long side for outline contour downsampling |
| `minContourArea` | `number` | `100` | Minimum contour area (scales proportionally with resolution) |
| `contourApproxEpsilon` | `number` | `0.003` | Contour polygon approximation coefficient |
| `maxRegions` | `number` | `500` | Maximum region count during segmentation |
