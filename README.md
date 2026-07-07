[**🇨🇳 中文文档**](https://tonychan-hub.github.io/react-native-mask-segment-canvas/zh-CN/)

---

# 🎨 react-native-mask-segment-canvas

A React Native **0.79** interactive mask segmentation library combining **OpenCV** semantic layout + **Skia** GPU-accelerated texture painting.

- 🧠 **OpenCV** (`react-native-fast-opencv`): mask semantic layout, baseboard patching, region extraction
- 🖌️ **Skia RuntimeEffect (SkSL)**: single-pass LAB frequency-layer color blending
- ✂️ **Skia Path**: dashed outline highlights per region
- 🧲 **Magnetic Lasso**: manual wall partitioning with edge-snapping + Active Contour refinement

---

## 📖 Full Documentation

**All API references, configuration guides, integration examples, and troubleshooting are maintained on the documentation site:**

👉 **[https://tonychan-hub.github.io/react-native-mask-segment-canvas/](https://tonychan-hub.github.io/react-native-mask-segment-canvas/)**

| Section | Description |
|---|---|
| [Overview](https://tonychan-hub.github.io/react-native-mask-segment-canvas/docs/intro) | Architecture & pipeline overview |
| [Installation](https://tonychan-hub.github.io/react-native-mask-segment-canvas/docs/installation) | Peer deps, postinstall, Metro config |
| [Basic Usage](https://tonychan-hub.github.io/react-native-mask-segment-canvas/docs/basic-usage) | Minimal example, state variables, watchState |
| [API Reference](https://tonychan-hub.github.io/react-native-mask-segment-canvas/docs/api) | Props, ref methods, types, storage convention |
| [Performance](https://tonychan-hub.github.io/react-native-mask-segment-canvas/docs/performance) | Benchmarks, optimization tips, pipeline config tuning |
| [Troubleshooting](https://tonychan-hub.github.io/react-native-mask-segment-canvas/docs/troubleshooting) | Common issues & fixes |

---

## 📦 Quick Install

```bash
npm install react-native-mask-segment-canvas
```

**Required peer dependencies:**

```bash
npm install @shopify/react-native-skia react-native-reanimated \
  react-native-fast-opencv react-native-fs buffer upng-js
```

Your host `package.json` must include `patch-package` in `postinstall`:

```json
{
  "scripts": { "postinstall": "patch-package" },
  "devDependencies": { "patch-package": "^8.0.1" }
}
```

See the [Installation Guide](https://tonychan-hub.github.io/react-native-mask-segment-canvas/docs/installation) for full Metro configuration and troubleshooting duplicate module errors.

---

## 🧪 Example Project

The [`example/`](example/) directory contains a complete consumer-side integration demo using only the public API — ideal as a template for your own project.

```bash
cd example
npm install
cd ios && pod install && cd ..
npm start
```

---

## 🏗️ Dev Demo

The root `App.tsx` is a self-test demo that imports directly from `./src`:

```bash
npm install
cd ios && pod install && cd ..
npm run ios  # or `npm run android`
```

---

## 📁 Project Structure

```
MaskSegmentApp/
├── src/                 # Library source → published to npm
│   ├── index.ts
│   └── components/ / utils/
├── docs/                # Docusaurus documentation site
├── example/             # Consumer-side integration demo
├── App.tsx              # Dev self-test (imports from ./src)
└── patches/             # patch-package patches for react-native-fast-opencv
```
