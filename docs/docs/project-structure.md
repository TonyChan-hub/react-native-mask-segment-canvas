---
id: project-structure
title: Project Structure
---

# 📁 Project Structure

```
MaskSegmentApp/                              # Repo root (npm package react-native-mask-segment-canvas)
├── App.tsx                                  # Dev self-test Demo (imports from ./src directly)
├── src/
│   ├── index.ts                             # Package entry (consumer: import 'react-native-mask-segment-canvas')
│   ├── components/
│   │   ├── MaskSegmentCanvas.tsx
│   │   └── MaskSegmentCanvas.types.ts
│   └── utils/
│       ├── maskSegmentation.ts
│       ├── maskSegmentRuntime.ts
│       ├── maskSemanticPalette.ts
│       ├── magneticLasso.ts          # Edge-snapping lasso (Sobel + Dijkstra)
│       ├── activeContour.ts          # Active Contour refinement (snake + balloon)
│       ├── wallTextureSplit.ts       # Automatic & manual wall texture splitting
│       └── ...
├── example/                                 # ★ Recommended: consumer-side integration demo
│   ├── App.tsx                              # Full example using only the public API
│   ├── index.js / app.json
│   ├── package.json                         # Required deps + "react-native-mask-segment-canvas": "file:.."
│   ├── metro.config.js / babel.config.js / tsconfig.json
│   └── README.md                            # How to integrate in a real project
├── patches/                                 # Shipped with the package; applied by host postinstall
├── ios/                                     # Root Demo native project (not published to npm)
└── android/
```
