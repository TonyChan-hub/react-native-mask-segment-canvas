---
id: intro
title: Overview
sidebar_position: 1
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 🎨 react-native-mask-segment-canvas

A React Native **0.79** interactive mask segmentation library. The core export is the `MaskSegmentCanvas` component, consumable via **npm package** or **npm link** from any React Native project.

- 🧠 **OpenCV** (`react-native-fast-opencv`): mask semantic layout, baseboard patching, region extraction
- 🖌️ **Skia RuntimeEffect (SkSL)**: single-pass full-screen shader blending original image + LAB low/high frequency texture color overlays
- ✂️ **Skia Path**: dashed outline highlights for regions
- 🧲 **Magnetic Lasso**: manual wall partitioning with edge-snapping (Sobel gradient + Dijkstra shortest-path) and Active Contour boundary refinement
- 👆 **Interaction**: bottom color bar for brush selection (optional initialization) → tap a region to paint; tapping without a brush selected fires `onPaintCallback` with a hint; long-press without a brush previews the region's dashed outline

This repository serves as both the **library source** (`src/index.ts`) and a **self-test demo** (root `App.tsx`).

📌 **For the recommended integration demo, see the `example/` directory** — it uses only the public API, fully simulating how a consumer project would integrate (including `package.json`, Metro configuration, and a complete reference `App.tsx`).

---

## 🔭 Overview

`MaskSegmentCanvas` renders an original image with an overlaid semantic mask, allowing users to tap regions and apply colors. The pipeline:

1. 📥 **Load** the origin image and mask image (local `file://` or remote `http(s)://`)
2. 🧩 **Segment** the mask via OpenCV into semantic regions (walls, ceiling, baseboard, etc.)
3. 🎨 **Prepare** LAB frequency-layer textures via SkSL for realistic color blending
4. 📐 **Build** Skia dashed-outline paths for each region
5. 🧲 **Manual Split** (optional) — draw lasso polygons on walls to subdivide into independently-paintable `wall-N` regions, with optional edge-snapping and Active Contour refinement
6. 👆 **Interactive** — users select a brush color and tap regions to paint; paint layers preserve the underlying texture
7. 💾 **Save** the composited result as PNG; export a JSON session for draft recovery

The component emits `onWatch` state transitions through the pipeline so the host app can show appropriate loading states.

---

## 📋 Requirements

- 🟢 Node.js >= 18 (recommended 20+)
- 🍎 Xcode 15+ (iOS)
- 🤖 Android Studio + JDK 17 (Android)
- 📦 CocoaPods (iOS)

---

## 🚀 Next Steps

- **[Installation](/docs/installation)** — set up the library in your project
- **[Quick Start](/docs/quick-start)** — run the dev demo
- **[Basic Usage](/docs/basic-usage)** — minimal example to get started
- **[API Reference](/docs/api)** — full prop and method documentation
