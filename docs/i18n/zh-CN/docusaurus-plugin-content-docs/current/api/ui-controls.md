---
id: ui-controls
title: "Props：UI 控件与样式"
---

# 🎛️ Props：UI 控件与样式

| Prop | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `showToolbar` | `boolean` | `true` | 顶部工具栏（"清除缓存并重新分割"） |
| `showColorBar` | `boolean` | `true` | 底部画笔颜色条 |
| `showStatusRow` | `boolean` | `true` | 分割/加载状态文字 |
| `showOverlayButtons` | `boolean` | `true` | 左下撤销、右下对比按钮 |
| `showDebugPickers` | `boolean` | `true` | 相册调试选择器（生产环境设为 `false`） |
| `disabled` | `boolean` | `false` | 禁用上色交互 |
| `style` | `ViewStyle` | — | 外层容器样式 |
| `canvasStyle` | `ViewStyle` | — | 画布区域样式 |
| `undoButtonStyle` / `compareButtonStyle` | `ViewStyle` | — | 覆盖按钮样式 |
| `undoButtonTextStyle` / `compareButtonTextStyle` | `TextStyle` | — | 覆盖按钮文字样式 |
| `undoButtonText` | `string` | `Undo` | 撤销按钮标签 |
| `compareButtonText` | `string` | `Compare` | 进入对比模式标签 |
| `compareExitButtonText` | `string` | `Exit Compare` | 退出对比模式标签 |
| `renderUndoButton` | `(props) => ReactNode` | — | 自定义撤销按钮渲染器 |
| `renderCompareButton` | `(props) => ReactNode` | — | 自定义对比按钮渲染器 |
