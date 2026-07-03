---
id: troubleshooting
title: Troubleshooting
---

# 🔧 Troubleshooting

## iOS pod install fails

```bash
cd ios
bundle install
bundle exec pod install --repo-update
```

## Android build errors

```bash
cd android && ./gradlew clean && cd ..
```

## Segmentation fails / zero regions

- Verify `originUrl` / `maskUrl` are accessible
- Confirm mask semantic colors match the `semanticColors` config
- Check Metro logs for `[MaskSegment]` / `[⏱ ...]` output

## Dashed outlines misaligned / extra contours

- Outlines are generated from mask pixel external contours; long-press only shows the connected component at the touch point
- The initial carousel only shows the largest connected component for each semantic region

## Common Duplicate Module Errors

**Symptoms:**
- `SkiaPictureView must be a function (received 'undefined')`
- `createAnimatedNode: Animated node[...] already exists`

**Solution:**
1. Copy the `singletonPackages` + `extraNodeModules` + `blockList` pattern from `example/metro.config.js`
2. At the top of your `index.js`, import gesture-handler → reanimated → skia in order
3. Restart Metro with `--reset-cache` and reinstall the app
