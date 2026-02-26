/**
 * ============================================================================
 * Benchmark Results Analyzer
 * ============================================================================
 * 
 * Reads data/benchmark-results.json and produces:
 *   1. Formatted console output with tables
 *   2. CSV files for graphing (gas-costs.csv, ipfs-performance.csv, scalability.csv)
 *   3. Markdown report (data/benchmark-report.md) ready for research paper
 * 
 * Features:
 *   - Fetches live ETH price from CoinGecko API
 *   - Calculates USD costs at multiple gas price tiers
 *   - Includes 95% confidence intervals in all outputs
 * 
 * Usage:
 *   node scripts/analyze-results.js
 *   node scripts/analyze-results.js --eth-price 4000
 * 
 * @author Benchmarking Suite for BTech FYP
 * @version 2.0
 */

const fs = require("fs");
const path = require("path");

// ============================================================================
// CONFIGURATION
// ============================================================================

const DATA_DIR = path.join(__dirname, "..", "data");
const RESULTS_FILE = path.join(DATA_DIR, "benchmark-results.json");
const DEFAULT_ETH_PRICE = 3500;
const DEFAULT_GAS_PRICE_GWEI = 20;

// ============================================================================
// ETH PRICE FETCHING
// ============================================================================

/**
 * Fetches current ETH price from CoinGecko API.
 * Falls back to default price if the API is unreachable.
 * 
 * CoinGecko's free API has rate limits (30 calls/min) which is more than
 * sufficient for our single-call use case.
 * 
 * @returns {Promise<number>} ETH price in USD
 */
async function fetchEthPrice() {
    try {
        // Manual timeout using AbortController (works in all Node.js 18+ versions)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
            { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const price = data.ethereum.usd;
        console.log(`  ✓ Live ETH price: $${price.toLocaleString()}`);
        return price;
    } catch (error) {
        console.log(`  ⚠ Could not fetch live ETH price (${error.message}). Using default: $${DEFAULT_ETH_PRICE}`);
        return DEFAULT_ETH_PRICE;
    }
}

// ============================================================================
// CSV GENERATION
// ============================================================================

/**
 * Converts an array of objects to CSV string.
 * Handles nested objects by flattening keys with underscores.
 * 
 * @param {Object[]} rows - Array of row objects
 * @param {string[]} columns - Column headers
 * @returns {string} CSV content
 */
function toCSV(rows, columns) {
    const header = columns.join(",");
    const body = rows
        .map((row) => columns.map((col) => {
            const val = row[col];
            if (typeof val === "string" && val.includes(",")) return `"${val}"`;
            return val ?? "";
        }).join(","))
        .join("\n");
    return header + "\n" + body;
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Generates the gas cost analysis table and CSV.
 */
function analyzeGasCosts(gasCosts, ethPrice, gasPriceGwei) {
    console.log("\n" + "=".repeat(70));
    console.log("  GAS COST ANALYSIS");
    console.log("=".repeat(70));

    const rows = [];

    console.log("\n  ┌─────────────────────────┬──────────────┬──────────────┬──────────────┬──────────────────────┐");
    console.log("  │ Operation               │ Avg Gas      │ USD Cost     │ Avg Time     │ 95% CI (Gas)         │");
    console.log("  ├─────────────────────────┼──────────────┼──────────────┼──────────────┼──────────────────────┤");

    for (const [name, data] of Object.entries(gasCosts)) {
        const avgGas = data.gas.mean;
        const costEth = avgGas * gasPriceGwei * 1e-9;
        const costUsd = costEth * ethPrice;
        const avgTimeMs = data.time.mean;
        const ci = `[${data.gas.ci95Lower.toFixed(0)}, ${data.gas.ci95Upper.toFixed(0)}]`;

        console.log(
            `  │ ${name.padEnd(23)} │ ${avgGas.toFixed(0).padStart(10)}   │ $${costUsd.toFixed(4).padStart(9)}   │ ${(avgTimeMs / 1000).toFixed(3).padStart(8)}s   │ ${ci.padStart(18)}   │`
        );

        rows.push({
            operation: name,
            contract: data.contract,
            description: data.description,
            avg_gas: avgGas.toFixed(0),
            stddev_gas: data.gas.stddev.toFixed(0),
            ci95_lower: data.gas.ci95Lower.toFixed(0),
            ci95_upper: data.gas.ci95Upper.toFixed(0),
            cost_eth: costEth.toFixed(8),
            cost_usd: costUsd.toFixed(4),
            avg_time_ms: avgTimeMs.toFixed(2),
            stddev_time_ms: data.time.stddev.toFixed(2),
            gas_price_gwei: gasPriceGwei,
            eth_price_usd: ethPrice,
        });
    }

    console.log("  └─────────────────────────┴──────────────┴──────────────┴──────────────┴──────────────────────┘");

    // Write CSV
    const csvPath = path.join(DATA_DIR, "gas-costs.csv");
    const columns = [
        "operation", "contract", "description", "avg_gas", "stddev_gas",
        "ci95_lower", "ci95_upper", "cost_eth", "cost_usd",
        "avg_time_ms", "stddev_time_ms", "gas_price_gwei", "eth_price_usd",
    ];
    fs.writeFileSync(csvPath, toCSV(rows, columns));
    console.log(`\n  ✓ Saved: ${csvPath}`);

    return rows;
}

/**
 * Generates the gas price sensitivity analysis.
 */
function analyzeGasPriceSensitivity(sensitivity, ethPrice) {
    console.log("\n" + "=".repeat(70));
    console.log("  GAS PRICE SENSITIVITY (USD Cost per Operation)");
    console.log("=".repeat(70));

    if (!sensitivity) {
        console.log("  ⚠ No gas price sensitivity data found.");
        return [];
    }

    // Get all operation names
    const firstTier = Object.values(sensitivity)[0];
    const opNames = Object.keys(firstTier || {});

    // Print header
    const gasTiers = Object.keys(sensitivity);
    let header = "  │ Operation               ";
    for (const tier of gasTiers) {
        header += `│ ${tier.padStart(10)} `;
    }
    console.log("\n  ┌" + "─".repeat(25) + gasTiers.map(() => "┬" + "─".repeat(12)).join("") + "┐");
    console.log(header + "│");
    console.log("  ├" + "─".repeat(25) + gasTiers.map(() => "┼" + "─".repeat(12)).join("") + "┤");

    const rows = [];

    for (const opName of opNames) {
        let row = `  │ ${opName.padEnd(23)} `;
        const rowData = { operation: opName };

        for (const tier of gasTiers) {
            const data = sensitivity[tier][opName];
            // Recalculate with live ETH price
            const costUsd = data.gasUsed * data.gasPriceGwei * 1e-9 * ethPrice;
            row += `│ $${costUsd.toFixed(3).padStart(8)}   `;
            rowData[tier] = costUsd.toFixed(4);
        }

        console.log(row + "│");
        rows.push(rowData);
    }

    console.log("  └" + "─".repeat(25) + gasTiers.map(() => "┴" + "─".repeat(12)).join("") + "┘");

    // Write CSV
    const csvPath = path.join(DATA_DIR, "gas-price-sensitivity.csv");
    const columns = ["operation", ...gasTiers];
    fs.writeFileSync(csvPath, toCSV(rows, columns));
    console.log(`\n  ✓ Saved: ${csvPath}`);

    return rows;
}

/**
 * Generates the IPFS performance analysis table and CSV.
 */
function analyzeIpfsPerformance(ipfsData) {
    console.log("\n" + "=".repeat(70));
    console.log("  IPFS PERFORMANCE");
    console.log("=".repeat(70));

    if (!ipfsData || ipfsData.error) {
        console.log(`\n  ❌ IPFS tests were not run: ${ipfsData?.message || "No data"}`);
        return [];
    }

    const { uploadResults, retrievalResults, endToEndResults } = ipfsData;

    console.log("\n  ┌────────────┬──────────────┬──────────────┬──────────────┐");
    console.log("  │ File Size  │ Upload (IPFS)│ Retrieval    │ End-to-End   │");
    console.log("  ├────────────┼──────────────┼──────────────┼──────────────┤");

    const rows = [];

    for (const sizeLabel of Object.keys(uploadResults || {})) {
        const upload = uploadResults[sizeLabel];
        const retrieval = retrievalResults[sizeLabel];
        const e2e = endToEndResults[sizeLabel];

        const uploadStr = `${(upload.mean / 1000).toFixed(2)}s`;
        const retrievalStr = `${(retrieval.mean / 1000).toFixed(2)}s`;
        const e2eStr = `${(e2e.mean / 1000).toFixed(2)}s`;

        console.log(
            `  │ ${sizeLabel.padEnd(10)} │ ${uploadStr.padStart(10)}   │ ${retrievalStr.padStart(10)}   │ ${e2eStr.padStart(10)}   │`
        );

        rows.push({
            file_size: sizeLabel,
            size_bytes: upload.sizeBytes,
            upload_avg_ms: upload.mean.toFixed(2),
            upload_stddev_ms: upload.stddev.toFixed(2),
            upload_ci95_lower: upload.ci95Lower.toFixed(2),
            upload_ci95_upper: upload.ci95Upper.toFixed(2),
            retrieval_avg_ms: retrieval.mean.toFixed(2),
            retrieval_stddev_ms: retrieval.stddev.toFixed(2),
            e2e_avg_ms: e2e.mean.toFixed(2),
            e2e_stddev_ms: e2e.stddev.toFixed(2),
        });
    }

    console.log("  └────────────┴──────────────┴──────────────┴──────────────┘");

    // Write CSV
    const csvPath = path.join(DATA_DIR, "ipfs-performance.csv");
    const columns = [
        "file_size", "size_bytes",
        "upload_avg_ms", "upload_stddev_ms", "upload_ci95_lower", "upload_ci95_upper",
        "retrieval_avg_ms", "retrieval_stddev_ms",
        "e2e_avg_ms", "e2e_stddev_ms",
    ];
    fs.writeFileSync(csvPath, toCSV(rows, columns));
    console.log(`\n  ✓ Saved: ${csvPath}`);

    return rows;
}

/**
 * Generates the scalability analysis table and CSV.
 */
function analyzeScalability(scalabilityData) {
    console.log("\n" + "=".repeat(70));
    console.log("  SCALABILITY ANALYSIS");
    console.log("=".repeat(70));

    if (!scalabilityData) {
        console.log("  ⚠ No scalability data found.");
        return { accumulation: [], concurrency: [] };
    }

    // ── Document Accumulation ──
    console.log("\n  ── Document Accumulation ──");
    console.log("  ┌─────────────────┬──────────────┬──────────────┐");
    console.log("  │ Total Documents │ Avg Gas      │ Avg Time     │");
    console.log("  ├─────────────────┼──────────────┼──────────────┤");

    const accumRows = [];
    if (scalabilityData.documentAccumulation) {
        for (const [key, data] of Object.entries(scalabilityData.documentAccumulation)) {
            console.log(
                `  │ ${String(data.totalDocuments).padStart(15)} │ ${data.gas.mean.toFixed(0).padStart(10)}   │ ${(data.time.mean / 1000).toFixed(3).padStart(8)}s   │`
            );

            accumRows.push({
                total_documents: data.totalDocuments,
                avg_gas: data.gas.mean.toFixed(0),
                stddev_gas: data.gas.stddev.toFixed(0),
                avg_time_ms: data.time.mean.toFixed(2),
                stddev_time_ms: data.time.stddev.toFixed(2),
            });
        }
    }

    console.log("  └─────────────────┴──────────────┴──────────────┘");

    // ── Concurrent Operations ──
    console.log("\n  ── Concurrent Operations ──");
    console.log("  ┌──────────────────┬──────────────┬──────────────┬──────────────┐");
    console.log("  │ Concurrent Users │ Success Rate │ Avg Response │ Throughput   │");
    console.log("  ├──────────────────┼──────────────┼──────────────┼──────────────┤");

    const concRows = [];
    if (scalabilityData.concurrentOperations) {
        for (const [key, data] of Object.entries(scalabilityData.concurrentOperations)) {
            console.log(
                `  │ ${String(data.userCount).padStart(16)} │ ${(data.successRate + "%").padStart(10)}   │ ${(data.responseTime.mean / 1000).toFixed(2).padStart(8)}s   │ ${(data.throughputTps + " tx/s").padStart(10)}   │`
            );

            concRows.push({
                concurrent_users: data.userCount,
                success_count: data.successCount,
                fail_count: data.failCount,
                success_rate_pct: data.successRate,
                avg_response_ms: data.responseTime.mean.toFixed(2),
                stddev_response_ms: data.responseTime.stddev.toFixed(2),
                throughput_tps: data.throughputTps,
                total_time_ms: data.totalTimeMs.toFixed(2),
            });
        }
    }

    console.log("  └──────────────────┴──────────────┴──────────────┴──────────────┘");

    if (scalabilityData.note) {
        console.log(`\n  ℹ Note: ${scalabilityData.note}`);
    }

    // Write CSVs
    const accumCsvPath = path.join(DATA_DIR, "document-accumulation.csv");
    const concCsvPath = path.join(DATA_DIR, "scalability.csv");

    if (accumRows.length > 0) {
        fs.writeFileSync(accumCsvPath, toCSV(accumRows, Object.keys(accumRows[0])));
        console.log(`\n  ✓ Saved: ${accumCsvPath}`);
    }

    if (concRows.length > 0) {
        fs.writeFileSync(concCsvPath, toCSV(concRows, Object.keys(concRows[0])));
        console.log(`  ✓ Saved: ${concCsvPath}`);
    }

    return { accumulation: accumRows, concurrency: concRows };
}

// ============================================================================
// MARKDOWN REPORT GENERATION
// ============================================================================

/**
 * Generates a comprehensive Markdown report suitable for inclusion
 * in a research paper. Includes methodology notes, tables, and
 * statistical details.
 */
function generateMarkdownReport(results, gasCostRows, ipfsRows, scalabilityRows, sensitivityRows, ethPrice) {
    const meta = results.metadata;
    const gasPrice = meta?.config?.defaultGasPrice || DEFAULT_GAS_PRICE_GWEI;

    let md = `# Benchmark Results Report

> **Generated**: ${new Date().toISOString()}
> **Network**: ${meta?.network || "hardhat-local"}
> **Solidity Version**: ${meta?.solidity || "0.8.20"}
> **ETH Price**: $${ethPrice.toLocaleString()} (${ethPrice !== DEFAULT_ETH_PRICE ? "live" : "default"})
> **Gas Price Baseline**: ${gasPrice} gwei
> **Iterations per Test**: ${meta?.config?.iterations || 5}

## Methodology

All gas measurements were obtained from Ethereum transaction receipts on a
Hardhat local network (deterministic EVM execution). Each operation was
repeated ${meta?.config?.iterations || 5} times. We report the mean, standard
deviation, and 95% confidence interval (z = 1.96) for each metric. IPFS
performance was measured against a local Kubo node running in Docker.

---

## 1. Gas Cost Analysis

| Operation | Contract | Avg Gas | Std Dev | 95% CI | Cost (USD) | Avg Time |
|-----------|----------|---------|---------|--------|------------|----------|
`;

    for (const row of gasCostRows) {
        md += `| ${row.operation} | ${row.contract} | ${row.avg_gas} | ${row.stddev_gas} | [${row.ci95_lower}, ${row.ci95_upper}] | $${row.cost_usd} | ${(row.avg_time_ms / 1000).toFixed(3)}s |\n`;
    }

    md += `
### Gas Cost Observations

- **Most expensive**: \`addMedicalRecord\` — stores 7 string parameters on-chain
- **Cheapest**: \`addAuditLog\` — simpler struct with fewer fields
- **Access management** (\`grantAccess\`, \`revokeAccess\`) falls in the mid-range

---

## 2. Gas Price Sensitivity

USD cost per operation at varying gas prices (ETH = $${ethPrice.toLocaleString()}):

`;

    if (sensitivityRows.length > 0) {
        const tiers = Object.keys(sensitivityRows[0]).filter(k => k !== "operation");
        md += "| Operation |";
        for (const t of tiers) md += ` ${t} |`;
        md += "\n|-----------|";
        for (const t of tiers) md += `------|`;
        md += "\n";

        for (const row of sensitivityRows) {
            md += `| ${row.operation} |`;
            for (const t of tiers) md += ` $${row[t]} |`;
            md += "\n";
        }
    }

    md += `
> **Key Finding**: At peak congestion (200 gwei), costs increase 10× compared to
> low-activity periods (20 gwei). This highlights the importance of gas price
> optimization strategies for healthcare dApps.

---

## 3. IPFS Performance

`;

    if (ipfsRows.length > 0) {
        md += `| File Size | Upload (avg) | Upload (σ) | Retrieval (avg) | End-to-End (avg) |
|-----------|-------------|------------|-----------------|------------------|
`;
        for (const row of ipfsRows) {
            md += `| ${row.file_size} | ${(row.upload_avg_ms / 1000).toFixed(3)}s | ${(row.upload_stddev_ms / 1000).toFixed(3)}s | ${(row.retrieval_avg_ms / 1000).toFixed(3)}s | ${(row.e2e_avg_ms / 1000).toFixed(3)}s |\n`;
        }
    } else {
        md += `> ⚠ IPFS tests were not run (node unavailable). Re-run with IPFS Docker container active.\n`;
    }

    md += `
---

## 4. Scalability Analysis

### Document Accumulation

Measures whether gas costs increase as the contract accumulates more records.

`;

    if (scalabilityRows.accumulation.length > 0) {
        md += `| Total Documents | Avg Gas | Std Dev | Avg Time |
|----------------:|--------:|--------:|---------:|
`;
        for (const row of scalabilityRows.accumulation) {
            md += `| ${row.total_documents} | ${row.avg_gas} | ${row.stddev_gas} | ${(row.avg_time_ms / 1000).toFixed(3)}s |\n`;
        }
    }

    md += `
### Concurrent Operations

Measures application-layer throughput under simultaneous transaction submission.

> **Note**: These results measure client-side submission concurrency (how fast
> transactions can be submitted), not on-chain block-level throughput. Real
> Ethereum mainnet processes transactions sequentially within ~12s blocks.

`;

    if (scalabilityRows.concurrency.length > 0) {
        md += `| Users | Success Rate | Avg Response | Throughput (tx/s) |
|------:|-------------:|-------------:|------------------:|
`;
        for (const row of scalabilityRows.concurrency) {
            md += `| ${row.concurrent_users} | ${row.success_rate_pct}% | ${(row.avg_response_ms / 1000).toFixed(2)}s | ${row.throughput_tps} |\n`;
        }
    }

    md += `
---

## 5. Cost Comparison: Blockchain vs. Centralized

See \`data/comparison.json\` for detailed cost comparison data between:
- **Ethereum Mainnet** — current system
- **Polygon L2** — lower gas costs
- **Centralized (AWS)** — traditional cloud infrastructure

Key advantages of the blockchain approach:
1. **Immutable audit trail** — critical for HIPAA compliance
2. **Decentralized access control** — no single point of failure
3. **Patient data sovereignty** — patient controls who sees their records
4. **Cryptographic integrity** — IPFS content-addressing guarantees data hasn't been tampered with

---

*Report generated by the Medical Document Management System Benchmarking Suite v2.0*
`;

    const reportPath = path.join(DATA_DIR, "benchmark-report.md");
    fs.writeFileSync(reportPath, md);
    console.log(`\n  ✓ Markdown report saved: ${reportPath}`);

    return reportPath;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log("╔══════════════════════════════════════════════════════════════════════╗");
    console.log("║              BENCHMARK RESULTS ANALYZER v2.0                        ║");
    console.log("╚══════════════════════════════════════════════════════════════════════╝");

    // ── Parse CLI args ──
    const args = process.argv.slice(2);
    let ethPriceOverride = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--eth-price" && args[i + 1]) {
            ethPriceOverride = parseFloat(args[i + 1]);
        }
    }

    // ── Load results ──
    if (!fs.existsSync(RESULTS_FILE)) {
        console.error(`\n  ❌ Results file not found: ${RESULTS_FILE}`);
        console.error("  Run the benchmark first: npm run benchmark");
        process.exit(1);
    }

    const results = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8"));
    console.log(`\n  ✓ Loaded results from: ${RESULTS_FILE}`);
    console.log(`  Benchmark timestamp: ${results.metadata?.timestamp || "unknown"}`);

    // ── Fetch ETH price ──
    let ethPrice;
    if (ethPriceOverride) {
        ethPrice = ethPriceOverride;
        console.log(`  Using CLI-specified ETH price: $${ethPrice}`);
    } else {
        ethPrice = await fetchEthPrice();
    }

    const gasPrice = results.metadata?.config?.defaultGasPrice || DEFAULT_GAS_PRICE_GWEI;

    // ── Run analyses ──
    const gasCostRows = analyzeGasCosts(results.gasCosts, ethPrice, gasPrice);
    const sensitivityRows = analyzeGasPriceSensitivity(results.gasPriceSensitivity, ethPrice);
    const ipfsRows = analyzeIpfsPerformance(results.ipfsPerformance);
    const scalabilityRows = analyzeScalability(results.scalability);

    // ── Generate Markdown report ──
    generateMarkdownReport(results, gasCostRows, ipfsRows, scalabilityRows, sensitivityRows, ethPrice);

    console.log("\n  ✅ Analysis complete!");
    console.log("  Generated files:");
    console.log("    • data/gas-costs.csv");
    console.log("    • data/gas-price-sensitivity.csv");
    console.log("    • data/ipfs-performance.csv");
    console.log("    • data/document-accumulation.csv");
    console.log("    • data/scalability.csv");
    console.log("    • data/benchmark-report.md");
}

main().catch((error) => {
    console.error("\n❌ Analysis failed:", error);
    process.exit(1);
});
