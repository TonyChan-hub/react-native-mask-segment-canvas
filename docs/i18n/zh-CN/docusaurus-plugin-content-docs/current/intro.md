---
id: intro
title: 概述
---

# 🎨 react-native-mask-segment-canvas

一个 React Native **0.79** 交互式遮罩分割库。核心导出为 `MaskSegmentCanvas` 组件，可通过 **npm 包** 或 **npm link** 在任何 React Native 项目中使用。

- 🧠 **OpenCV** (`react-native-fast-opencv`)：遮罩语义布局、踢脚线修补、区域提取
- 🖌️ **Skia RuntimeEffect (SkSL)**：单 Pass 全屏着色器，混合原图 + LAB 低频/高频纹理颜色叠加
- ✂️ **Skia Path**：区域虚线轮廓高亮
- 👆 **交互**：底部颜色条选择画笔（可选初始化）→ 点击区域上色；未选择画笔时点击会触发 `onPaintCallback` 并附带提示；未选画笔时长按可预览区域的虚线轮廓

本仓库同时作为 **库源码**（`src/index.ts`）和 **自测 Demo**（根目录 `App.tsx`）。

📌 **推荐的集成 Demo 请查看 `example/` 目录** — 该目录仅使用公开 API，完全模拟消费方项目的集成方式（包括 `package.json`、Metro 配置和完整的参考 `App.tsx`）。

---

## 🔭 概述

`MaskSegmentCanvas` 渲染原始图像并叠加语义遮罩，允许用户点击区域并应用颜色。处理流程：

1. 📥 **加载**原始图像和遮罩图像（本地 `file://` 或远程 `http(s)://`）
2. 🧩 **分割**通过 OpenCV 将遮罩分割为语义区域（墙面、天花板、踢脚线等）
3. 🎨 **准备**通过 SkSL 生成 LAB 频域层纹理，实现逼真的颜色混合
4. 📐 **构建**每个区域的 Skia 虚线轮廓路径
5. 👆 **交互** — 用户选择画笔颜色并点击区域上色；上色层保留底层纹理
6. 💾 **保存**合成结果为 PNG；导出 JSON 会话用于草稿恢复

组件通过 `onWatch` 发出 Pipeline 状态转换，宿主应用可据此显示相应的加载状态。

---

## 📋 环境要求

- 🟢 Node.js >= 18（推荐 20+）
- 🍎 Xcode 15+（iOS）
- 🤖 Android Studio + JDK 17（Android）
- 📦 CocoaPods（iOS）

---

## 🚀 下一步

- **[安装](/docs/installation)** — 在项目中配置库
- **[快速开始](/docs/quick-start)** — 运行开发 Demo
- **[基本用法](/docs/basic-usage)** — 入门最小示例
- **[API 参考](/docs/api)** — 完整的 Props 和方法文档
