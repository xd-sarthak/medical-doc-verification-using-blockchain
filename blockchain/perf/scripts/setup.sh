#!/bin/bash
# One-command setup for MedVault Performance Benchmarking Suite

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          MEDVAULT PERFORMANCE SUITE — SETUP SCRIPT           ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# 1. Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed. Please install Docker and docker-compose."
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Error: Docker daemon is not running. Please start Docker."
    exit 1
fi

echo "✓ Docker is running"

# 2. Create directories
cd "$(dirname "$0")/../../.."
mkdir -p blockchain/perf-data/raw
mkdir -p blockchain/perf-reports
mkdir -p blockchain/perf-charts
mkdir -p blockchain/perf/test-data
echo "✓ Created output directories"

# 3. Generate Test Data
echo "Generating test documents..."
node blockchain/perf/generate-test-data.js

# 4. Start Infrastructure
echo "Starting Docker Compose infrastructure..."
docker compose -f docker-compose.perf.yml up -d

echo "Waiting for services to become healthy (this may take a minute)..."
sleep 15

# 5. Generate Wallets (pre-registers identities too)
echo "Generating and funding benchmark wallets..."
cd blockchain
npm install
npx hardhat compile
rm -f perf-data/wallets.json
npx hardhat run perf/wallet-generator.js --network localhost

echo ""
echo "✅ Setup Complete!"
echo ""
echo "You can now run benchmarks:"
echo "  npm run perf:test     — Run standard benchmark tiers"
echo "  npm run perf:stress   — Run saturation stress test"
echo "  npm run perf:full     — Run everything (test + stress + charts + report)"
echo ""
echo "Dashboards:"
echo "  Grafana:    http://localhost:3030 (admin/admin)"
echo "  Prometheus: http://localhost:9090"
