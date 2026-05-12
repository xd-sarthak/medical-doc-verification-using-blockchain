#!/bin/bash
# ============================================================================
# Research Pipeline Orchestrator
# ============================================================================
# This script orchestrates the full benchmarking and report generation pipeline.
# It assumes benchmark JSON data is already available in data/ and perf-data/
# (run benchmark.js and benchmark-engine.js prior if needed).
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOCKCHAIN_DIR="$(dirname "$SCRIPT_DIR")"

echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║          MEDVAULT RESEARCH PIPELINE ORCHESTRATOR v1.0               ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"

# Optional: You could run benchmarks here
# echo "[1] Running Gas & Scalability Benchmarks..."
# npx hardhat run scripts/benchmark.js
# node perf/benchmark-engine.js

echo "[1] Checking required data files..."
REQUIRED_FILES=(
  "$BLOCKCHAIN_DIR/data/benchmark-results.json"
  "$BLOCKCHAIN_DIR/data/comparison.json"
  "$BLOCKCHAIN_DIR/perf-data/latest-benchmark.json"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ Error: Required data file missing: $file"
    echo "Please ensure benchmarks have been run."
    exit 1
  fi
done

echo "✅ All required data files found."

echo ""
echo "[2] Running Final Report Generator..."
node "$SCRIPT_DIR/generate-final-report.js"

echo ""
echo "🎉 Research Pipeline Complete! See $BLOCKCHAIN_DIR/data/final-report for outputs."
