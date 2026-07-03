---
id: quick-start
title: 快速开始（开发 Demo）
---

# 🚀 快速开始（开发 Demo）

根目录 `App.tsx` 是一个完整的自测 Demo，直接从 `./src` 导入。

```bash
cd MaskSegmentApp

npm install

cd ios && bundle exec pod install && cd ..

npm start

# 在另一个终端中
npm run ios
# 或
npm run android
```

**查看消费方项目如何集成：** 进入 `example/` 目录并按照其中的 `README.md` 操作。它使用 `import from 'react-native-mask-segment-canvas'` 配合标准 `package.json` 和 Metro 配置，完全模拟消费方环境。
