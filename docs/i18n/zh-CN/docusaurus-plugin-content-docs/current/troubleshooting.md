---
id: troubleshooting
title: 故障排除
---

# 🔧 故障排除

## iOS pod install 失败

```bash
cd ios
bundle install
bundle exec pod install --repo-update
```

## Android 构建错误

```bash
cd android && ./gradlew clean && cd ..
```

## 分割失败 / 零区域

- 确认 `originUrl` / `maskUrl` 可访问
- 确认遮罩语义颜色与 `semanticColors` 配置匹配
- 检查 Metro 日志中的 `[MaskSegment]` / `[⏱ ...]` 输出

## 虚线轮廓错位 / 多余轮廓

- 轮廓从遮罩像素外部轮廓生成；长按仅显示触摸点下的连通分量
- 初始轮播仅显示每个语义区域的最大连通分量

## 常见重复模块错误

**症状：**
- `SkiaPictureView must be a function (received 'undefined')`
- `createAnimatedNode: Animated node[...] already exists`

**解决方案：**
1. 从 `example/metro.config.js` 复制 `singletonPackages` + `extraNodeModules` + `blockList` 模式
2. 在 `index.js` 顶部按顺序导入 gesture-handler → reanimated → skia
3. 使用 `--reset-cache` 重启 Metro 并重新安装应用
