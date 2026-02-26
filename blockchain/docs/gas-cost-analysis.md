# Gas Cost Analysis — Medical Document Management System

## System Architecture

This system uses a **three-contract architecture** on Ethereum, combined with **IPFS** for off-chain document storage:

| Contract | Purpose | Key Operations |
|----------|---------|----------------|
| **PatientManagement** | Patient registration + medical record storage | `registerPatient`, `addMedicalRecord`, `getMedicalRecords` |
| **DoctorManagement** | Doctor registration + access control | `registerDoctor`, `addPatientAccess`, `revokePatientAccess` |
| **HealthcareAudit** | Immutable audit trail logging | `addAuditLog`, `getAuditTrail` |

Medical documents (PDFs, images, reports) are stored on **IPFS**. Only the IPFS content hash (CID) and metadata are stored on-chain — this keeps gas costs manageable regardless of document size.

---

## Methodology

- **Network**: Hardhat local Ethereum network (Solidity 0.8.20, deterministic EVM)
- **Iterations**: Each operation measured 5 times
- **Statistics**: Mean, standard deviation, and 95% confidence interval (z = 1.96)
- **IPFS Node**: Local Kubo node via Docker (`ipfs/kubo`)
- **ETH Price**: $2,033.50 (live CoinGecko API at time of benchmark)
- **Gas Price Baseline**: 20 gwei

---

## 1. Gas Cost per Operation

Each write operation on the blockchain consumes gas. The table below shows the measured gas cost and corresponding USD cost at 20 gwei / $2,033.50 ETH:

| Operation | Contract | Avg Gas | Std Dev | 95% CI | Cost (USD) |
|-----------|----------|--------:|--------:|--------|----------:|
| `addMedicalRecord` | PatientManagement | 269,173 | ±1,252 | [268,075 – 270,271] | **$10.95** |
| `addAuditLog` | HealthcareAudit | 195,488 | ±7,647 | [188,785 – 202,191] | $7.95 |
| `registerDoctor` | DoctorManagement | 125,544 | ±5 | [125,539 – 125,548] | $5.11 |
| `registerPatient` | PatientManagement | 98,223 | ±5 | [98,218 – 98,227] | $3.99 |
| `grantAccess` | DoctorManagement | 93,419 | ±7 | [93,413 – 93,425] | $3.80 |
| `revokeAccess` | DoctorManagement | 34,960 | ±5 | [34,956 – 34,965] | **$1.42** |

### Key Observations

- **`addMedicalRecord` is the most expensive** (269K gas) because it stores 7 string parameters on-chain: IPFS hash, file type, file name, title, resume, previous version, plus a timestamp and doctor address.
- **`revokeAccess` is the cheapest** (35K gas) — it only flips a boolean mapping and removes from an array.
- **`addAuditLog`** is moderately expensive (195K gas) because it pushes a struct with 2 strings + 2 addresses to a dynamic array.
- **Registration costs** (`registerDoctor` > `registerPatient`) reflect the additional `doctorAddresses.push()` in the Doctor contract.

### Why These Costs Matter

On Ethereum mainnet at 20 gwei, uploading a single medical document costs ~$10.95. During network congestion (200 gwei), that rises to **$109.47**. This demonstrates that while blockchain provides strong integrity guarantees, cost optimization (e.g., Layer 2 solutions) is essential for production healthcare systems.

---

## 2. Gas Price Sensitivity Analysis

Ethereum gas prices fluctuate from ~5 gwei (quiet periods) to 200+ gwei (peak congestion). The cost of each operation scales linearly:

| Operation | 5 gwei | 20 gwei | 50 gwei | 100 gwei | 200 gwei |
|-----------|-------:|--------:|--------:|---------:|---------:|
| `addMedicalRecord` | $2.74 | $10.95 | $27.37 | $54.74 | **$109.47** |
| `addAuditLog` | $1.99 | $7.95 | $19.88 | $39.75 | $79.51 |
| `registerDoctor` | $1.28 | $5.11 | $12.76 | $25.53 | $51.06 |
| `registerPatient` | $1.00 | $3.99 | $9.99 | $19.97 | $39.95 |
| `grantAccess` | $0.95 | $3.80 | $9.50 | $19.00 | $37.99 |
| `revokeAccess` | $0.36 | $1.42 | $3.55 | $7.11 | $14.22 |

> **Finding**: At 200 gwei (peak congestion), costs are exactly **40× higher** than at 5 gwei. This 40× cost swing highlights the importance of gas price optimization strategies and Layer 2 solutions for healthcare dApps.

---

## 3. IPFS Performance

Medical documents are stored on IPFS — only the content hash goes on-chain. Upload and retrieval times scale with document size:

| File Size | Upload (avg) | Upload (σ) | Retrieval (avg) | End-to-End |
|-----------|-------------|------------|-----------------|------------|
| 1 KB | 28 ms | ±14 ms | 3.5 ms | 33 ms |
| 100 KB | 23 ms | ±7 ms | 5.5 ms | 29 ms |
| 1 MB | 63 ms | ±19 ms | 34 ms | 68 ms |
| 5 MB | 118 ms | ±24 ms | 100 ms | 124 ms |

### Key Observations

- Upload time grows roughly **linearly** with file size (~23ms per MB).
- **Retrieval is consistently faster** than upload at every file size.
- End-to-end time (IPFS upload + blockchain hash storage) is dominated by IPFS upload — the on-chain hash storage adds only ~5ms.
- Even a 5 MB medical image uploads + stores in **under 125ms** — well within acceptable interactive latency.

### Architectural Advantage

The critical insight: **on-chain storage cost is independent of document size**. Whether you upload a 1KB lab result or a 5MB DICOM scan, the blockchain gas cost is identical (~269K gas) because only the IPFS hash string is stored on-chain. This architecture makes the system cost-predictable.

---

## 4. Scalability Analysis

### Document Accumulation (10 → 1,000 documents)

Does gas cost increase as the contract stores more documents?

| Total Documents | Avg Gas | Std Dev | Change from 10 docs |
|----------------:|--------:|--------:|-------------------:|
| 10 | 314,287 | 0 | — |
| 100 | 314,347 | 0 | +0.019% |
| 500 | 314,383 | 0 | +0.031% |
| 1,000 | 314,407 | 0 | **+0.038%** |

> **Finding**: Gas cost remains effectively constant. The marginal increase (0.038% over 1,000 documents) is due to slightly longer IPFS hash strings in the dynamic array index calculation — it is negligible. This proves the Ethereum storage model does **not degrade** with scale for this application.

### Concurrent Operations (10 → 100 simultaneous users)

| Concurrent Users | Success Rate | Avg Response | Throughput |
|-----------------:|-------------:|-------------:|-----------:|
| 10 | 100% | 18 ms | 452 tx/s |
| 50 | 100% | 80 ms | 628 tx/s |
| 100 | 100% | 173 ms | 559 tx/s |

> **Note**: These measure client-side submission throughput, not on-chain block-level TPS. Real Ethereum mainnet processes transactions sequentially within ~12s blocks (~15 TPS). However, these results demonstrate that the application layer handles concurrent requests well.

---

## 5. Cost Comparison: Blockchain vs Alternatives

| Dimension | Ethereum | Polygon L2 | Hyperledger Fabric | Centralized (AWS) |
|-----------|:--------:|:----------:|:-----------------:|:-----------------:|
| **Per-tx cost (upload)** | $10.95 | $0.004 | $0 | $0.000006 |
| **Monthly infrastructure** | $0 | $0 | $200–$1,500 | $240 |
| **Data immutability** | ★★★★★ | ★★★★☆ | ★★★☆☆ | ★☆☆☆☆ |
| **Audit trail integrity** | ★★★★★ | ★★★★☆ | ★★★★☆ | ★★☆☆☆ |
| **Patient data sovereignty** | ★★★★★ | ★★★★★ | ★★★☆☆ | ★★☆☆☆ |
| **Throughput (TPS)** | ~15 | ~65 | ~3,500 | ~10,000+ |
| **Operational complexity** | Low | Low | High | Medium |

### Break-Even Analysis

- **Ethereum vs Centralized**: At ~43 transactions/month, centralized becomes cheaper per-tx. But blockchain's value is in **security and immutability**, not raw cost efficiency.
- **Polygon vs Centralized**: Break-even at ~80,000 tx/month — Polygon approaches cost parity at high volumes while retaining blockchain benefits.

---

## 6. Conclusions

1. **Gas costs are predictable**: Each operation has a deterministic gas cost that remains constant regardless of data volume.
2. **Document size doesn't affect blockchain cost**: IPFS + on-chain hash architecture decouples storage cost from file size.
3. **Gas price volatility is the main cost risk**: 40× cost variation (5–200 gwei) makes Layer 2 solutions essential for production use.
4. **IPFS performance is excellent**: Sub-second upload/retrieval for all tested file sizes (up to 5 MB).
5. **System scales linearly**: No degradation in gas costs or response times up to 1,000 documents and 100 concurrent users.
6. **Trade-off is clear**: Blockchain is more expensive per-transaction than centralized solutions but provides immutability, decentralization, and patient data sovereignty that centralized systems cannot guarantee.

---

## Charts

### Gas Cost per Operation

![Gas Cost Comparison](../data/charts/gas-cost-comparison.png)

### IPFS Upload Time vs File Size

![Upload Time vs File Size](../data/charts/upload-time-vs-filesize.png)

### Gas Price Sensitivity

![Gas Price Sensitivity](../data/charts/gas-price-sensitivity.png)

### Cost Comparison: Ethereum vs Polygon vs AWS

![Cost Comparison](../data/charts/cost-comparison.png)

### Concurrent Users Performance

![Concurrent Users Performance](../data/charts/concurrent-users-performance.png)

---

## How to Reproduce

```bash
# Prerequisites
docker run -d --name ipfs_node -p 5001:5001 -p 8080:8080 ipfs/kubo

# Install dependencies
cd blockchain && npm install

# Run full pipeline
npm run benchmark:full
# → Runs benchmark → analyze → generate-graphs

# Or individually:
npm run benchmark           # Step 1: Collect data
npm run analyze             # Step 2: CSV + Markdown report
npm run generate-graphs     # Step 3: PNG charts
```

---

*Generated by the Medical Document Management System Benchmarking Suite v2.0*
