---
id: quick-start
title: Quick Start (Dev Demo)
---

# 🚀 Quick Start (Dev Demo)

The root `App.tsx` is a full self-test demo that imports directly from `./src`.

```bash
cd MaskSegmentApp

npm install

cd ios && bundle exec pod install && cd ..

npm start

# In another terminal
npm run ios
# or
npm run android
```

**To see how a consumer project integrates:** go to the `example/` directory and follow its `README.md`. It uses `import from 'react-native-mask-segment-canvas'` with standard `package.json` and Metro config, fully simulating a consumer environment.
