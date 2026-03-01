/**
 * ============================================================================
 * Gas Cost Analysis — HTML Report Generator
 * ============================================================================
 *
 * Reads data/benchmark-results.json and data/charts/*.png to produce a
 * professional, self-contained HTML report with embedded chart images.
 *
 * Usage: node scripts/generate-benchmark-report.js
 *        node scripts/generate-benchmark-report.js --eth-price 4000
 *
 * Output: data/benchmark-report.html
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const CHARTS_DIR = path.join(DATA_DIR, "charts");
const RESULTS_FILE = path.join(DATA_DIR, "benchmark-results.json");
const COMPARISON_FILE = path.join(DATA_DIR, "comparison.json");
const OUTPUT_FILE = path.join(DATA_DIR, "benchmark-report.html");

const DEFAULT_ETH_PRICE = 3500;
const DEFAULT_GAS_PRICE_GWEI = 20;

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

function embedImage(filename) {
    const filePath = path.join(CHARTS_DIR, filename);
    if (!fs.existsSync(filePath)) return "";
    const base64 = fs.readFileSync(filePath).toString("base64");
    return `data:image/png;base64,${base64}`;
}

function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function usd(gas, gweiPrice, ethPrice) {
    return (gas * gweiPrice * 1e-9 * ethPrice).toFixed(4);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML GENERATION
// ─────────────────────────────────────────────────────────────────────────────

function generate(results, ethPrice) {
    const gasCosts = results.gasCosts;
    const sensitivity = results.gasPriceSensitivity;
    const ipfs = results.ipfsPerformance;
    const scalability = results.scalability;
    const meta = results.metadata || {};
    const gasPrice = meta?.config?.defaultGasPrice || DEFAULT_GAS_PRICE_GWEI;

    // ── Gas Cost Table Rows ──
    let gasCostRows = "";
    for (const [name, data] of Object.entries(gasCosts)) {
        const avgGas = data.gas.mean;
        const costUsd = usd(avgGas, gasPrice, ethPrice);
        const ci = `[${data.gas.ci95Lower.toFixed(0)}, ${data.gas.ci95Upper.toFixed(0)}]`;
        const timeStr = (data.time.mean / 1000).toFixed(3) + "s";
        gasCostRows += `<tr>
      <td>${escapeHtml(name)}</td>
      <td class="mono">${escapeHtml(data.contract)}</td>
      <td class="mono right">${avgGas.toFixed(0)}</td>
      <td class="mono right">±${data.gas.stddev.toFixed(0)}</td>
      <td class="mono right">${ci}</td>
      <td class="mono right highlight">$${costUsd}</td>
      <td class="mono right">${timeStr}</td>
    </tr>`;
    }

    // ── Gas Price Sensitivity Rows ──
    let sensitivitySection = "";
    if (sensitivity) {
        const tiers = Object.keys(sensitivity);
        const firstTier = Object.values(sensitivity)[0];
        const ops = Object.keys(firstTier || {});

        let headerCells = `<th>Operation</th>`;
        for (const t of tiers) headerCells += `<th class="right">${t.replace("_", " ")}</th>`;

        let bodyRows = "";
        for (const op of ops) {
            bodyRows += `<tr><td>${escapeHtml(op)}</td>`;
            for (const t of tiers) {
                const d = sensitivity[t][op];
                if (!d) { bodyRows += `<td class="mono right">—</td>`; continue; }
                const c = (d.gasUsed * d.gasPriceGwei * 1e-9 * ethPrice).toFixed(3);
                bodyRows += `<td class="mono right">$${c}</td>`;
            }
            bodyRows += `</tr>`;
        }

        sensitivitySection = `
    <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    }

    // ── IPFS Section ──
    let ipfsSection = "";
    if (ipfs && !ipfs.error) {
        const { uploadResults, retrievalResults, endToEndResults } = ipfs;
        let rows = "";
        for (const size of Object.keys(uploadResults || {})) {
            const u = uploadResults[size], r = retrievalResults[size], e = endToEndResults[size];
            rows += `<tr>
        <td>${size}</td>
        <td class="mono right">${(u.mean / 1000).toFixed(3)}s</td>
        <td class="mono right">±${(u.stddev / 1000).toFixed(3)}s</td>
        <td class="mono right">${(r.mean / 1000).toFixed(3)}s</td>
        <td class="mono right">${(e.mean / 1000).toFixed(3)}s</td>
      </tr>`;
        }
        ipfsSection = `<table>
      <thead><tr><th>File Size</th><th class="right">Upload</th><th class="right">Std Dev</th><th class="right">Retrieval</th><th class="right">End-to-End</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
    } else {
        ipfsSection = `<div class="note">⚠ IPFS tests were not run (node unavailable). Re-run with IPFS Docker container active.</div>`;
    }

    // ── Scalability Section ──
    let scalabilitySection = "";
    if (scalability) {
        // Document Accumulation
        let accumRows = "";
        if (scalability.documentAccumulation) {
            for (const [, d] of Object.entries(scalability.documentAccumulation)) {
                accumRows += `<tr>
          <td class="mono right">${d.totalDocuments}</td>
          <td class="mono right">${d.gas.mean.toFixed(0)}</td>
          <td class="mono right">±${d.gas.stddev.toFixed(0)}</td>
          <td class="mono right">${(d.time.mean / 1000).toFixed(3)}s</td>
        </tr>`;
            }
        }

        // Concurrent Operations
        let concRows = "";
        if (scalability.concurrentOperations) {
            for (const [, d] of Object.entries(scalability.concurrentOperations)) {
                concRows += `<tr>
          <td class="mono right">${d.userCount}</td>
          <td class="mono right">${d.successRate}%</td>
          <td class="mono right">${(d.responseTime.mean / 1000).toFixed(2)}s</td>
          <td class="mono right">${d.throughputTps} tx/s</td>
        </tr>`;
            }
        }

        scalabilitySection = `
    <h4>Document Accumulation</h4>
    <p class="caption">Measures if gas costs increase as contracts accumulate more records.</p>
    <table>
      <thead><tr><th class="right">Documents</th><th class="right">Avg Gas</th><th class="right">Std Dev</th><th class="right">Avg Time</th></tr></thead>
      <tbody>${accumRows}</tbody>
    </table>
    <h4>Concurrent Operations</h4>
    <p class="caption">Client-side submission throughput under concurrent load.</p>
    <table>
      <thead><tr><th class="right">Users</th><th class="right">Success</th><th class="right">Response</th><th class="right">Throughput</th></tr></thead>
      <tbody>${concRows}</tbody>
    </table>`;
    }

    // ── Embed chart images ──
    const chartGas = embedImage("gas-cost-comparison.png");
    const chartIpfs = embedImage("upload-time-vs-filesize.png");
    const chartConc = embedImage("concurrent-users-performance.png");
    const chartComp = embedImage("cost-comparison.png");
    const chartSens = embedImage("gas-price-sensitivity.png");

    function chartBlock(src, alt) {
        if (!src) return `<div class="note">⚠ Chart not available. Run <code>node scripts/generate-graphs.js</code> first.</div>`;
        return `<div class="chart-container"><img src="${src}" alt="${alt}" /></div>`;
    }

    // ── Assemble HTML ──
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gas Cost Analysis — Medical Record System</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  :root {
    --bg: #0a0a0f;
    --surface: #12121a;
    --surface2: #1a1a25;
    --border: #2a2a3a;
    --text: #e4e4e7;
    --text-muted: #71717a;
    --accent: #6366f1;
    --green: #10b981;
    --amber: #f59e0b;
    --red: #ef4444;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.7;
  }
  .container { max-width: 1100px; margin: 0 auto; padding: 40px 24px 60px; }

  /* Header */
  .header {
    text-align: center;
    margin-bottom: 48px;
    padding-bottom: 32px;
    border-bottom: 1px solid var(--border);
  }
  .header h1 {
    font-size: 2.2rem;
    font-weight: 700;
    background: linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 8px;
  }
  .header .subtitle { color: var(--text-muted); font-size: 0.9rem; }

  /* Meta bar */
  .meta-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
    margin-bottom: 40px;
  }
  .meta-tag {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 14px;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .meta-tag strong { color: var(--text); margin-right: 4px; }

  /* Section */
  .section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 32px;
    margin-bottom: 28px;
  }
  .section h2 {
    font-size: 1.2rem;
    font-weight: 600;
    margin-bottom: 6px;
    color: var(--accent);
  }
  .section h4 {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 24px 0 8px;
    color: var(--text);
  }
  .caption { color: var(--text-muted); font-size: 0.82rem; margin-bottom: 16px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 0.84rem; margin-top: 12px; }
  thead th {
    text-align: left;
    padding: 10px 12px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    background: var(--surface2);
    border-bottom: 1px solid var(--border);
    font-weight: 500;
  }
  tbody tr { border-bottom: 1px solid var(--border); }
  tbody tr:hover { background: rgba(255,255,255,0.02); }
  td { padding: 9px 12px; }
  .mono { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; }
  .right { text-align: right; }
  .highlight { color: var(--green); font-weight: 600; }

  /* Charts */
  .chart-container {
    margin: 20px 0 8px;
    background: #fff;
    border-radius: 12px;
    padding: 16px;
    text-align: center;
  }
  .chart-container img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }

  .note {
    background: rgba(245,158,11,0.1);
    border: 1px solid rgba(245,158,11,0.25);
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 0.84rem;
    color: var(--amber);
    margin: 12px 0;
  }

  .footer {
    text-align: center;
    margin-top: 40px;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  @media (max-width: 700px) {
    .header h1 { font-size: 1.5rem; }
    .section { padding: 20px 16px; }
    table { font-size: 0.75rem; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>⛽ Gas Cost Analysis Report</h1>
    <div class="subtitle">Medical Document Management System — Performance Benchmarks</div>
  </div>

  <div class="meta-bar">
    <span class="meta-tag"><strong>Network:</strong> ${meta.network || "hardhat-local"}</span>
    <span class="meta-tag"><strong>Solidity:</strong> ${meta.solidity || "0.8.20"}</span>
    <span class="meta-tag"><strong>ETH Price:</strong> $${ethPrice.toLocaleString()}</span>
    <span class="meta-tag"><strong>Gas Price:</strong> ${gasPrice} gwei</span>
    <span class="meta-tag"><strong>Iterations:</strong> ${meta.config?.iterations || 5}</span>
    <span class="meta-tag"><strong>Generated:</strong> ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>
  </div>

  <!-- 1. Gas Cost Analysis -->
  <div class="section">
    <h2>1. Gas Cost per Operation</h2>
    <p class="caption">Average gas consumption and USD cost for each smart contract write operation at ${gasPrice} gwei.</p>
    <table>
      <thead><tr><th>Operation</th><th>Contract</th><th class="right">Avg Gas</th><th class="right">Std Dev</th><th class="right">95% CI</th><th class="right">USD Cost</th><th class="right">Time</th></tr></thead>
      <tbody>${gasCostRows}</tbody>
    </table>
    ${chartBlock(chartGas, "Gas Cost Comparison")}
  </div>

  <!-- 2. Gas Price Sensitivity -->
  <div class="section">
    <h2>2. Gas Price Sensitivity</h2>
    <p class="caption">USD cost per operation at varying gas prices (ETH = $${ethPrice.toLocaleString()}).</p>
    ${sensitivitySection}
    ${chartBlock(chartSens, "Gas Price Sensitivity")}
  </div>

  <!-- 3. IPFS Performance -->
  <div class="section">
    <h2>3. IPFS Performance</h2>
    <p class="caption">Upload, retrieval, and end-to-end latency for medical documents of varying sizes.</p>
    ${ipfsSection}
    ${chartBlock(chartIpfs, "IPFS Upload Time vs File Size")}
  </div>

  <!-- 4. Scalability -->
  <div class="section">
    <h2>4. Scalability Analysis</h2>
    ${scalabilitySection}
    ${chartBlock(chartConc, "Concurrent Users Performance")}
  </div>

  <!-- 5. Cost Comparison -->
  <div class="section">
    <h2>5. Cost Comparison: Blockchain vs. Centralized</h2>
    <p class="caption">Per-operation cost across Ethereum Mainnet, Polygon L2, and traditional centralized infrastructure (AWS).</p>
    ${chartBlock(chartComp, "Cost Comparison")}
  </div>

  <div class="footer">
    Generated by <code>generate-benchmark-report.js</code> — Medical Document Management System Benchmarking Suite v2.0
  </div>
</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

function main() {
    if (!fs.existsSync(RESULTS_FILE)) {
        console.error("❌ No benchmark results found at:", RESULTS_FILE);
        console.error("   Run `npm run benchmark` first.");
        process.exit(1);
    }

    // Parse CLI args
    const args = process.argv.slice(2);
    let ethPrice = DEFAULT_ETH_PRICE;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--eth-price" && args[i + 1]) {
            ethPrice = parseFloat(args[i + 1]);
        }
    }

    const results = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8"));
    const html = generate(results, ethPrice);
    fs.writeFileSync(OUTPUT_FILE, html, "utf-8");

    console.log(`\n📊 Benchmark HTML report generated: ${OUTPUT_FILE}`);
    console.log(`   ETH price: $${ethPrice.toLocaleString()}`);
    console.log(`   Charts embedded: ${fs.existsSync(CHARTS_DIR) ? fs.readdirSync(CHARTS_DIR).filter(f => f.endsWith(".png")).length : 0} images`);
}

main();
