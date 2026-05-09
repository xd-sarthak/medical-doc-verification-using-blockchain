# MedVault V2 Performance Engineering & Benchmarking Suite

This directory contains a complete distributed systems benchmarking suite for the MedVault V2 smart contracts.

## Architecture

The suite uses a containerized approach to isolate resources and measure true throughput:

1. **Dockerized Hardhat Node**: A local Ethereum environment pre-configured with 1000 funded accounts, auto-mining instantly to isolate execution time from consensus time.
2. **IPFS (Kubo)**: Local IPFS node to test realistic document upload/retrieval latencies.
3. **Observability Stack**: Prometheus, Grafana, cAdvisor, and Node Exporter collect sub-second metrics on CPU, Memory, Network I/O, and Disk I/O.
4. **Node.js Benchmark Engine**: Async worker pools simulate hundreds of concurrent users hitting the V2 contracts and IPFS API simultaneously.

## Quick Start

1. **Setup**: Pulls images, creates directories, and generates test documents.
   ```bash
   npm run perf:setup
   ```

2. **Run Standard Benchmarks**: Tests 1, 10, 50, and 100 concurrent users.
   ```bash
   npm run perf:test
   ```

3. **Generate Charts and Reports**:
   ```bash
   npm run perf:charts
   npm run perf:report
   ```

4. **View Dashboards**:
   - Open Grafana at [http://localhost:3030](http://localhost:3030) (admin/admin)
   - Navigate to the **MedVault Performance** dashboard.

## Advanced Testing

- **Stress Testing**: Find the exact saturation point of the system (TPS ceiling).
  ```bash
  npm run perf:stress
  ```
- **Cost Comparison**: Calculate equivalent L1, L2, and AWS costs.
  ```bash
  npm run perf:cost
  ```

## Output Structure

- `perf-data/`: Raw JSON benchmark outputs and cached wallets
- `perf-charts/`: PNG charts ready for papers/portfolios
- `perf-reports/`: Markdown reports summarizing the benchmark runs
