---
id: interaction-guide
title: Interaction Guide
---

# 🎮 Interaction Guide

1. 🔁 **Initial Carousel**: After regions are ready, each region's dashed outline flashes sequentially per `initRegionFlashMs` (default 1s); stops on first user touch.
2. 🔍 **Preview (no brush selected)**: Long-press a region to show dashed outline for the connected component under the touch point; tapping a black area shows no outline.
3. 🎨 **Paint (brush selected)**: Tap a color in the bottom color bar or call `ref.setPaintColor` (or preselect via `initialPaintColor`), then tap a region to paint; tapping the same region again overwrites the color.
4. 💬 **Tap without brush**: No paint is performed; `onPaintCallback` fires with `kind: 'brush_required'`, carrying a `hint` and target region info for the host to show a toast/modal prompting color selection.
5. ↩️ **Undo**: Bottom-left button or `ref.reset()`; steps backward through paint history one action at a time.
6. 👁️ **Compare with Origin**: Bottom-right button or `ref.swap()`; hides the paint layer to show the original image.
