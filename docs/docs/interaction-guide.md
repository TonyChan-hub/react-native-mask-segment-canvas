---
id: interaction-guide
title: Interaction Guide
---

# 🎮 Interaction Guide

## Paint Mode

1. 🔁 **Initial Carousel**: After regions are ready, each region's dashed outline flashes sequentially per `initRegionFlashMs` (default 1s); stops on first user touch.
2. 🔍 **Preview (no brush selected)**: Long-press a region to show dashed outline for the connected component under the touch point; tapping a black area shows no outline.
3. 🎨 **Paint (brush selected)**: Tap a color in the bottom color bar or call `ref.setPaintColor` (or preselect via `initialPaintColor`), then tap a region to paint; tapping the same region again overwrites the color.
4. 💬 **Tap without brush**: No paint is performed; `onPaintCallback` fires with `kind: 'brush_required'`, carrying a `hint` and target region info for the host to show a toast/modal prompting color selection.
5. ↩️ **Undo**: Bottom-left button or `ref.reset()`; steps backward through paint history one action at a time.
6. 👁️ **Compare with Origin**: Bottom-right button or `ref.swap()`; hides the paint layer to show the original image.

## Lasso Mode (Manual Wall Split)

When `manualSplitWalls` is enabled and lasso mode is active:

7. 🧲 **Enter Lasso**: Call `ref.startLasso()` to activate lasso mode. The lasso polygon overlay (orange) appears.
8. 👆 **Place Vertices**: Tap on wall areas to place polygon vertices. Vertices snap to wall-mask edges/corners automatically.
9. 🧲 **Magnetic Lasso** (when `magneticLasso: true`): Paths between taps automatically follow strong image edges (green path overlay) via Sobel gradient + Dijkstra shortest-path.
10. 🔒 **Close Polygon**: Tap near the first vertex to close the polygon. A closed polygon is outlined in orange.
11. ✋ **Drag Vertices**: Touch and drag an existing vertex to reposition it. The vertex snaps to wall boundary/corner points, or stays within the wall mask for interior positions.
12. ✅ **End Lasso**: Call `ref.endLasso()` to convert all closed polygons into `wall-N` sub-regions ready for painting.
13. 🗑️ **Cancel Lasso**: Call `ref.cancelLasso()` to discard all in-progress lasso polygons without saving.
14. 🗑️ **Delete Lasso**: Call `ref.deleteLasso(id)` to remove a previously committed lasso polygon and its associated `wall-N` region.

### Active Contour Refinement

When `activeContourRefine: true`, the closed lasso polygon is automatically refined after `endLasso()`:

- Each vertex samples positions along its outward normal direction
- Vertices expand to the nearest wall-mask boundary edge (balloon force)
- Douglas-Peucker simplification removes redundant vertices
- Result: the polygon hugs the true wall outline rather than the raw tap positions
