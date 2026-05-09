/**
 * ============================================================================
 * Chart Generator — Portfolio-Grade Visualizations
 * ============================================================================
 *
 * Uses QuickChart.io to generate polished PNG charts from the raw JSON
 * benchmark data. Creates charts for latency, TPS, errors, and more.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "perf-data");
const RAW_DIR = path.join(DATA_DIR, "raw");
const CHARTS_DIR = path.join(__dirname, "..", "perf-charts");
const QUICKCHART_BASE = "https://quickchart.io/chart";

const COLORS = {
  primary: "rgba(59, 130, 246, 0.8)",      // Blue
  secondary: "rgba(16, 185, 129, 0.8)",     // Green
  accent: "rgba(245, 158, 11, 0.8)",        // Amber
  danger: "rgba(239, 68, 68, 0.8)",         // Red
  purple: "rgba(139, 92, 246, 0.8)",        // Purple
  primaryBorder: "rgba(59, 130, 246, 1)",
  secondaryBorder: "rgba(16, 185, 129, 1)",
  accentBorder: "rgba(245, 158, 11, 1)",
  dangerBorder: "rgba(239, 68, 68, 1)",
  purpleBorder: "rgba(139, 92, 246, 1)",
  bg: "#111827", // Dark background for portfolio aesthetics
  text: "#F9FAFB",
  grid: "rgba(255,255,255,0.1)"
};

async function generateChart(chartConfig, filename) {
  const payload = {
    chart: JSON.stringify(chartConfig),
    width: 1000,
    height: 600,
    backgroundColor: COLORS.bg,
    format: "png",
    version: "4",
  };

  try {
    const response = await fetch(QUICKCHART_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(path.join(CHARTS_DIR, filename), buffer);
    console.log(`  ✓ Saved: ${filename}`);
  } catch (e) {
    console.error(`  ❌ Failed to generate ${filename}: ${e.message}`);
  }
}

function getCommonOptions(title, xLabel, yLabel) {
  return {
    responsive: true,
    plugins: {
      title: { display: true, text: title, color: COLORS.text, font: { size: 18, weight: "bold" } },
      legend: { labels: { color: COLORS.text } },
    },
    scales: {
      x: {
        title: { display: true, text: xLabel, color: COLORS.text },
        ticks: { color: COLORS.text },
        grid: { color: COLORS.grid }
      },
      y: {
        title: { display: true, text: yLabel, color: COLORS.text },
        ticks: { color: COLORS.text },
        grid: { color: COLORS.grid },
        beginAtZero: true
      }
    }
  };
}

async function main() {
  console.log("Generating Portfolio-Grade Charts...");
  if (!fs.existsSync(CHARTS_DIR)) fs.mkdirSync(CHARTS_DIR, { recursive: true });

  const latestBench = path.join(DATA_DIR, "latest-benchmark.json");
  if (!fs.existsSync(latestBench)) {
    console.error("No benchmark data found.");
    return;
  }

  const data = JSON.parse(fs.readFileSync(latestBench, "utf-8"));
  const tiers = Object.keys(data).map(t => parseInt(t.replace("tier_", ""))).sort((a,b)=>a-b);
  
  // 1. Throughput (TPS) vs Users
  const tpsConfig = {
    type: "line",
    data: {
      labels: tiers.map(t => `${t} Users`),
      datasets: [
        {
          label: "Grant Consent (TPS)",
          data: tiers.map(t => data[`tier_${t}`].grantConsent.throughputTps),
          borderColor: COLORS.primaryBorder,
          backgroundColor: COLORS.primary,
          tension: 0.3, fill: false
        },
        {
          label: "Create Record (TPS)",
          data: tiers.map(t => data[`tier_${t}`].createRecord.throughputTps),
          borderColor: COLORS.secondaryBorder,
          backgroundColor: COLORS.secondary,
          tension: 0.3, fill: false
        }
      ]
    },
    options: getCommonOptions("System Throughput Scalability", "Concurrent Users", "Transactions per Second (TPS)")
  };
  await generateChart(tpsConfig, "tps-vs-users.png");

  // 2. Latency vs Users
  const latencyConfig = {
    type: "bar",
    data: {
      labels: tiers.map(t => `${t} Users`),
      datasets: [
        {
          label: "Avg Latency (ms)",
          data: tiers.map(t => data[`tier_${t}`].createRecord.avgLatencyMs),
          backgroundColor: COLORS.primary,
        },
        {
          label: "p95 Latency (ms)",
          data: tiers.map(t => data[`tier_${t}`].createRecord.p95LatencyMs),
          backgroundColor: COLORS.accent,
        }
      ]
    },
    options: getCommonOptions("Transaction Latency Distribution (Create Record)", "Concurrent Users", "Latency (ms)")
  };
  await generateChart(latencyConfig, "latency-vs-concurrent-users.png");

  console.log("✅ Chart generation complete.");
}

if (require.main === module) main();
module.exports = { main };
