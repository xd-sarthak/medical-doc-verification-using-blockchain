#!/bin/bash
# End-to-end orchestration script

set -e

echo "Starting full benchmark pipeline..."

cd "$(dirname "$0")/../.."

# 1. Standard Benchmark
echo "Running standard benchmark..."
npx hardhat run perf/benchmark-engine.js --network localhost

# 2. Stress Test
echo "Running stress test..."
npx hardhat run perf/stress-tester.js --network localhost

# 3. Cost Comparator
echo "Running cost comparator..."
node perf/cost-comparator.js

# 4. Chart Generator
echo "Generating charts..."
node perf/chart-generator.js

# 5. Report Generator
echo "Generating Markdown report..."
node perf/report-generator.js

echo ""
echo "✅ Full benchmark pipeline complete!"
echo "Check perf-reports/ for the final Markdown report."
