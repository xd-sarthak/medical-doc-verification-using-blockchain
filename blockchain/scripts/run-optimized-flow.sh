#!/usr/bin/env bash
set -euo pipefail

export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-/tmp}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp}"

echo "==> compile"
npm run compile:local

echo "==> test"
npm run test:local

echo "==> benchmark optimized"
npm run benchmark:optimized:local

echo "==> compare gas"
node scripts/compare-gas.js

echo "==> done"
