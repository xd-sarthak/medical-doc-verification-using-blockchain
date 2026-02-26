# Benchmark Suite — Medical Document Management System

Comprehensive gas cost analysis and performance benchmarking for the Ethereum + IPFS medical document management system.

## Prerequisites

| Requirement | Version | Check |
|---|---|---|
| Node.js | ≥ 18.0 | `node --version` |
| Hardhat | ≥ 2.26 | `npx hardhat --version` |
| Docker | Any | `docker --version` |
| IPFS (Kubo) | Latest | See below |

### Start IPFS Docker Container

```bash
# Pull and start IPFS node
docker run -d --name ipfs_node \
  -p 5001:5001 \
  -p 8080:8080 \
  ipfs/kubo

# Verify it's running
curl -X POST http://127.0.0.1:5001/api/v0/id
```

### Install Dependencies

```bash
cd blockchain
npm install
```

---

## Quick Start

```bash
# Run everything (benchmark → analyze → charts)
npm run benchmark:full

# Or run each step separately:
npm run benchmark         # Step 1: Run benchmarks
npm run analyze           # Step 2: Analyze results
npm run generate-graphs   # Step 3: Generate PNG charts
```

---

## Scripts

### `npm run benchmark`

Runs `scripts/benchmark.js` via Hardhat. Deploys all 3 contracts and executes 4 test phases:

1. **Gas Cost Analysis** — Measures `gasUsed` from transaction receipts for all 6 write operations
2. **Gas Price Sensitivity** — Calculates USD cost at 5, 20, 50, 100, 200 gwei
3. **IPFS Performance** — Upload/retrieval timing for 1KB, 100KB, 1MB, 5MB documents
4. **Scalability Testing** — Document accumulation (10–1000) and concurrent users (10–100)

**Output**: `data/benchmark-results.json`

**Resumability**: If interrupted, the benchmark saves a checkpoint to `data/benchmark-checkpoint.json` and resumes from the last completed phase on re-run.

### `npm run analyze`

Runs `scripts/analyze-results.js`. Reads the benchmark results and produces:

- `data/gas-costs.csv`
- `data/gas-price-sensitivity.csv`
- `data/ipfs-performance.csv`
- `data/document-accumulation.csv`
- `data/scalability.csv`
- `data/benchmark-report.md` (comprehensive Markdown report)

**Options**:
```bash
node scripts/analyze-results.js --eth-price 4000  # Override ETH price
```

By default, fetches the live ETH price from CoinGecko API.

### `npm run generate-graphs`

Runs `scripts/generate-graphs.js`. Uses the [QuickChart.io](https://quickchart.io) API to generate PNG chart images (zero local dependencies):

- `data/charts/gas-cost-comparison.png`
- `data/charts/upload-time-vs-filesize.png`
- `data/charts/concurrent-users-performance.png`
- `data/charts/cost-comparison.png`
- `data/charts/gas-price-sensitivity.png`

**Options**:
```bash
node scripts/generate-graphs.js --eth-price 4000  # Override ETH price
```

---

## Configuration

Edit the `CONFIG` object at the top of `scripts/benchmark.js`:

```javascript
const CONFIG = {
  iterations: 5,           // Repetitions per test (increase for tighter CIs)
  fileSizes: [...],        // Document sizes for IPFS tests
  gasPrices: [5, 20, 50, 100, 200],  // Gas prices in gwei
  concurrencyTiers: [10, 50, 100],    // Concurrent user counts
  documentCounts: [10, 100, 500, 1000], // Document accumulation targets
  ipfsApiUrl: "http://127.0.0.1:5001",
  defaultEthPrice: 3500,
  defaultGasPrice: 20,
};
```

---

## Methodology

### Gas Measurement

Gas is measured from the `gasUsed` field of Ethereum transaction receipts. On Hardhat's local network, gas consumption is **deterministic** — the same transaction with the same state will always consume the same gas. This eliminates noise from network conditions and provides exact reproducible measurements.

### Statistical Analysis

For each operation measured N times:

- **Mean** (μ): arithmetic average
- **Standard Deviation** (σ): sample standard deviation using Bessel's correction (n-1)
- **95% Confidence Interval**: μ ± 1.96 × (σ / √n)

The 95% CI means there is a 95% probability that the true population mean falls within the stated interval.

### USD Cost Calculation

```
cost_USD = gasUsed × gasPrice_gwei × 10⁻⁹ × ETH_price_USD
```

### IPFS Timing

IPFS upload and retrieval times are measured using `process.hrtime.bigint()` for nanosecond precision, then converted to milliseconds. The IPFS node runs locally in Docker, so network latency is eliminated — measuring pure IPFS processing time.

### Scalability: Concurrent Operations Note

The concurrent operations test uses `Promise.allSettled` to submit multiple transactions simultaneously. This measures **client-side submission throughput**, not on-chain block-level throughput. In a real Ethereum network:

- Transactions enter the mempool
- Miners/validators process them sequentially within each block
- Block time is ~12 seconds, with ~100 transactions per block

This distinction is important when citing these results in a research paper.

---

## Output Files

```
data/
├── benchmark-results.json       # Raw benchmark data (all phases)
├── benchmark-checkpoint.json    # Resumability checkpoint (deleted on completion)
├── benchmark-report.md          # Auto-generated Markdown report
├── comparison.json              # Platform comparison data
├── gas-costs.csv                # Gas cost per operation
├── gas-price-sensitivity.csv    # Cost at varying gas prices
├── ipfs-performance.csv         # IPFS upload/retrieval times
├── document-accumulation.csv    # Gas cost vs document count
├── scalability.csv              # Concurrent user results
└── charts/
    ├── gas-cost-comparison.png
    ├── upload-time-vs-filesize.png
    ├── concurrent-users-performance.png
    ├── cost-comparison.png
    └── gas-price-sensitivity.png
```

---

## Interpreting Results

### Gas Costs

- `addMedicalRecord` is the most expensive operation because it stores 7 string parameters on-chain
- `addAuditLog` is cheaper but still non-trivial because it stores 2 strings + 2 addresses
- Access management (`grantAccess`, `revokeAccess`) involves mapping updates which are relatively cheap

### Gas Price Sensitivity

At 200 gwei (peak congestion), costs are **10× higher** than at 20 gwei (normal conditions). For a production healthcare dApp, consider:
- Polygon L2 (same contracts, ~99.7% cheaper)
- Gas price oracles to time transactions optimally
- Batch operations when possible

### IPFS Performance

Upload time scales roughly linearly with file size. The on-chain hash storage cost remains constant regardless of document size — this is a key advantage of the IPFS + blockchain architecture.

### Scalability

- Gas cost should remain constant regardless of how many documents are stored (Ethereum storage model)
- Concurrent submission throughput measures the application's ability to handle multiple users, not blockchain capacity

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `IPFS node is NOT running` | Start Docker: `docker run -d --name ipfs_node -p 5001:5001 -p 8080:8080 ipfs/kubo` |
| `Could not fetch live ETH price` | CoinGecko API may be rate-limited. Use `--eth-price 3500` flag. |
| `QuickChart API returned HTTP 429` | Too many chart requests. Wait 60 seconds and retry. |
| Benchmark takes too long | Reduce `iterations` or `documentCounts` in CONFIG |
| `Cannot find module` | Run `npm install` in the `blockchain/` directory |

---

## Citing in Research Paper

When referencing these benchmarks, use the following methodology description:

> *Gas consumption was measured on a local Hardhat Ethereum network (Solidity 0.8.20,
> deterministic EVM). Each operation was executed N times, and we report the mean,
> standard deviation, and 95% confidence interval. IPFS performance was measured
> against a local Kubo IPFS node. USD costs were calculated using live ETH prices
> from the CoinGecko API. Concurrent operation tests used Promise.allSettled for
> client-side submission throughput measurement.*

---

## Known Limitations

1. **Local network only**: Hardhat provides deterministic gas measurements but doesn't reflect real network conditions (congestion, MEV, variable block times)
2. **IPFS locality**: IPFS measurements are against a local Docker node; real-world IPFS retrieval depends on peer availability and network topology
3. **Concurrency**: `Promise.allSettled` measures submission throughput, not on-chain processing throughput
4. **Gas prices**: USD costs assume static gas prices; real Ethereum uses EIP-1559 dynamic pricing (base fee + priority fee)
