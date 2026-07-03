---
id: ui-controls
title: "Props: UI Controls & Styling"
---

# 🎛️ Props: UI Controls & Styling

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `showToolbar` | `boolean` | `true` | Top toolbar ("Clear cache & re-segment") |
| `showColorBar` | `boolean` | `true` | Bottom brush color strip |
| `showStatusRow` | `boolean` | `true` | Segmentation/loading status text |
| `showOverlayButtons` | `boolean` | `true` | Bottom-left undo, bottom-right compare buttons |
| `showDebugPickers` | `boolean` | `true` | Photo library debug picker (set to `false` in production) |
| `disabled` | `boolean` | `false` | Disable paint interaction |
| `style` | `ViewStyle` | — | Outer container style |
| `canvasStyle` | `ViewStyle` | — | Canvas area style |
| `undoButtonStyle` / `compareButtonStyle` | `ViewStyle` | — | Overlay button styles |
| `undoButtonTextStyle` / `compareButtonTextStyle` | `TextStyle` | — | Overlay button text styles |
| `undoButtonText` | `string` | `Undo` | Undo button label |
| `compareButtonText` | `string` | `Compare` | Enter compare mode label |
| `compareExitButtonText` | `string` | `Exit Compare` | Exit compare mode label |
| `renderUndoButton` | `(props) => ReactNode` | — | Custom undo button renderer |
| `renderCompareButton` | `(props) => ReactNode` | — | Custom compare button renderer |
