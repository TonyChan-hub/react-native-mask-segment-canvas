#!/usr/bin/env bash
# 可选：预检 GitHub 镜像是否可用（默认镜像见 ios/offline_pods.rb）
set -euo pipefail

MIRROR="${COCOAPODS_GITHUB_MIRROR:-https://ghproxy.net/https://github.com}"
TEST_URL="${MIRROR}/google/double-conversion.git"

echo "Checking CocoaPods GitHub mirror..."
if git ls-remote "$TEST_URL" HEAD >/dev/null 2>&1; then
  echo "✓ Mirror OK: $MIRROR"
else
  echo "✗ Mirror unreachable: $MIRROR"
  echo "  Try: export COCOAPODS_GITHUB_MIRROR='https://mirror.ghproxy.com/https://github.com'"
  exit 1
fi
