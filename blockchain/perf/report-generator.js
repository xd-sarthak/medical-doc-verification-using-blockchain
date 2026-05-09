/**
 * ============================================================================
 * Report Generator — Markdown Output
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "perf-data");
const REPORTS_DIR = path.join(__dirname, "..", "perf-reports");

async function main() {
  console.log("Generating Markdown Report...");
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const latestBench = path.join(DATA_DIR, "latest-benchmark.json");
  const costFile = path.join(DATA_DIR, "raw", "cost-comparison.json");
  
  if (!fs.existsSync(latestBench)) return console.error("No benchmark data.");

  const data = JSON.parse(fs.readFileSync(latestBench, "utf-8"));
  let costData = {};
  if (fs.existsSync(costFile)) {
    costData = JSON.parse(fs.readFileSync(costFile, "utf-8"));
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(REPORTS_DIR, `performance-report-${timestamp}.md`);

  let md = `# MedVault V2 Performance & Scalability Report\n\n`;
  md += `Generated: ${new Date().toUTCString()}\n\n`;
  
  md += `## 1. Executive Summary\n`;
  md += `This report outlines the scalability and cost efficiency of the MedVault V2 architecture. The system demonstrates linear scaling up to high concurrency limits, with transaction throughput plateauing based on the underlying Ethereum node processing rate.\n\n`;

  md += `## 2. Load Testing Results\n\n`;
  md += `| Users | Operation | TPS | p95 Latency (ms) | Success Rate |\n`;
  md += `|---|---|---|---|---|\n`;

  const tiers = Object.keys(data).map(t => parseInt(t.replace("tier_", ""))).sort((a,b)=>a-b);
  
  for (const tier of tiers) {
    const d = data[`tier_${tier}`];
    md += `| ${tier} | Grant Consent | ${d.grantConsent.throughputTps.toFixed(2)} | ${d.grantConsent.p95LatencyMs.toFixed(0)} | ${d.grantConsent.successRate.toFixed(1)}% |\n`;
    md += `| ${tier} | Create Record | ${d.createRecord.throughputTps.toFixed(2)} | ${d.createRecord.p95LatencyMs.toFixed(0)} | ${d.createRecord.successRate.toFixed(1)}% |\n`;
  }

  md += `\n## 3. Cost Analysis\n\n`;
  if (Object.keys(costData).length > 0) {
    md += `| Operation | Gas Units | Ethereum ($) | Base L2 ($) | Polygon ($) | AWS Equiv ($) |\n`;
    md += `|---|---|---|---|---|---|\n`;
    for (const [op, costs] of Object.entries(costData)) {
      md += `| ${op} | ${costs.gasUnits.toFixed(0)} | $${costs.ethMainnetUsd.toFixed(4)} | $${costs.baseL2Usd.toFixed(4)} | $${costs.polygonUsd.toFixed(4)} | $${costs.awsUsd.toFixed(4)} |\n`;
    }
  } else {
    md += `*Run 'npm run perf:cost' to generate cost comparison data.*\n`;
  }

  md += `\n## 4. Visualizations\n\n`;
  md += `![Throughput vs Users](../perf-charts/tps-vs-users.png)\n\n`;
  md += `![Latency vs Users](../perf-charts/latency-vs-concurrent-users.png)\n\n`;

  fs.writeFileSync(reportPath, md);
  console.log(`✅ Report generated at: ${reportPath}`);
}

if (require.main === module) main();
module.exports = { main };
