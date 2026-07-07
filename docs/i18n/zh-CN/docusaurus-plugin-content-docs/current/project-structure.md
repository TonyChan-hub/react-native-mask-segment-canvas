---
id: project-structure
title: 项目结构
---

# 📁 项目结构

```
MaskSegmentApp/                              # 仓库根目录（npm 包 react-native-mask-segment-canvas）
├── App.tsx                                  # 开发自测 Demo（直接从 ./src 导入）
├── src/
│   ├── index.ts                             # 包入口（消费方：import 'react-native-mask-segment-canvas'）
│   ├── components/
│   │   ├── MaskSegmentCanvas.tsx
│   │   └── MaskSegmentCanvas.types.ts
│   └── utils/
│       ├── maskSegmentation.ts
│       ├── maskSegmentRuntime.ts
│       ├── maskSemanticPalette.ts
│       ├── magneticLasso.ts          # 边缘吸附套索（Sobel + Dijkstra）
│       ├── activeContour.ts          # 主动轮廓精炼（Snake + Balloon）
│       ├── wallTextureSplit.ts       # 自动与手动墙面纹理分割
│       └── ...
├── example/                                 # ★ 推荐：消费方集成 Demo
│   ├── App.tsx                              # 仅使用公开 API 的完整示例
│   ├── index.js / app.json
│   ├── package.json                         # 所需依赖 + "react-native-mask-segment-canvas": "file:.."
│   ├── metro.config.js / babel.config.js / tsconfig.json
│   └── README.md                            # 如何在真实项目中集成
├── patches/                                 # 随包发布；由宿主 postinstall 应用
├── ios/                                     # 根 Demo 原生项目（不发布到 npm）
└── android/
```
