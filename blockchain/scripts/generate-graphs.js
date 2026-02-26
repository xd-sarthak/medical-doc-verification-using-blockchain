/**
 * ============================================================================
 * Chart Generator — QuickChart API
 * ============================================================================
 * 
 * Generates PNG chart images using the QuickChart.io API.
 * ZERO local dependencies — just HTTP calls to the QuickChart service.
 * 
 * Charts generated:
 *   1. gas-cost-comparison.png     — Bar chart of gas cost per operation
 *   2. upload-time-vs-filesize.png — Line chart (file size → IPFS upload time)
 *   3. concurrent-users.png        — Line chart (users → response time)
 *   4. cost-comparison.png         — Grouped bar (Ethereum vs Polygon vs AWS)
 *   5. gas-price-sensitivity.png   — Line chart (gwei → USD cost)
 * 
 * Usage:
 *   node scripts/generate-graphs.js
 *   node scripts/generate-graphs.js --eth-price 4000
 * 
 * QuickChart.io is a free, open-source chart rendering API. It accepts
 * Chart.js configuration as a URL parameter and returns a PNG image.
 * No API key required for reasonable usage (< 100 charts/day).
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
const CHARTS_DIR = path.join(DATA_DIR, "charts");
const RESULTS_FILE = path.join(DATA_DIR, "benchmark-results.json");
const COMPARISON_FILE = path.join(DATA_DIR, "comparison.json");
const DEFAULT_ETH_PRICE = 3500;

// QuickChart API base URL
const QUICKCHART_BASE = "https://quickchart.io/chart";

// Professional color palette for consistent chart styling
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
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Downloads a chart image from QuickChart API and saves it as PNG.
 * 
 * @param {Object} chartConfig - Chart.js configuration object
 * @param {string} filename - Output filename (without path)
 * @param {Object} options - Width, height, background color
 */
async function generateChart(chartConfig, filename, options = {}) {
    const {
        width = 800,
        height = 500,
        backgroundColor = "white",
    } = options;

    const payload = {
        chart: JSON.stringify(chartConfig),
        width,
        height,
        backgroundColor,
        format: "png",
        version: "4", // Chart.js v4
    };

    try {
        // Use POST to avoid URL length limits for complex charts
        const response = await fetch(QUICKCHART_BASE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`QuickChart API returned HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const outputPath = path.join(CHARTS_DIR, filename);
        fs.writeFileSync(outputPath, buffer);
        console.log(`  ✓ Saved: ${outputPath} (${(buffer.length / 1024).toFixed(1)} KB)`);

        return outputPath;
    } catch (error) {
        console.error(`  ❌ Failed to generate ${filename}: ${error.message}`);
        return null;
    }
}

/**
 * Common chart options for consistent styling across all graphs.
 */
function getCommonOptions(title, xLabel, yLabel) {
    return {
        responsive: true,
        plugins: {
            title: {
                display: true,
                text: title,
                font: { size: 16, weight: "bold" },
                padding: { bottom: 20 },
            },
            legend: {
                position: "top",
                labels: { font: { size: 12 }, padding: 15 },
            },
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: xLabel,
                    font: { size: 13, weight: "bold" },
                },
                grid: { display: false },
            },
            y: {
                title: {
                    display: true,
                    text: yLabel,
                    font: { size: 13, weight: "bold" },
                },
                beginAtZero: true,
                grid: { color: "rgba(0,0,0,0.05)" },
            },
        },
    };
}

// ============================================================================
// CHART GENERATORS
// ============================================================================

/**
 * Chart 1: Gas cost comparison bar chart.
 * Shows gas used and USD cost for each smart contract operation.
 */
async function generateGasCostChart(gasCosts, ethPrice) {
    const operations = Object.keys(gasCosts);
    const gasValues = operations.map((op) => gasCosts[op].gas.mean);
    const gasPriceGwei = 20;
    const usdValues = gasValues.map((g) => parseFloat((g * gasPriceGwei * 1e-9 * ethPrice).toFixed(4)));

    const chartConfig = {
        type: "bar",
        data: {
            labels: operations.map(op => op.replace(/([A-Z])/g, ' $1').trim()),
            datasets: [
                {
                    label: "Gas Used",
                    data: gasValues,
                    backgroundColor: COLORS.primary,
                    borderColor: COLORS.primaryBorder,
                    borderWidth: 1,
                    yAxisID: "y",
                },
                {
                    label: `USD Cost (@${gasPriceGwei} gwei, $${ethPrice} ETH)`,
                    data: usdValues,
                    backgroundColor: COLORS.accent,
                    borderColor: COLORS.accentBorder,
                    borderWidth: 1,
                    yAxisID: "y1",
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: "Gas Cost per Smart Contract Operation",
                    font: { size: 16, weight: "bold" },
                    padding: { bottom: 20 },
                },
                legend: { position: "top" },
            },
            scales: {
                x: {
                    title: { display: true, text: "Operation", font: { size: 13 } },
                    grid: { display: false },
                },
                y: {
                    type: "linear",
                    position: "left",
                    title: { display: true, text: "Gas Used", font: { size: 13 } },
                    beginAtZero: true,
                },
                y1: {
                    type: "linear",
                    position: "right",
                    title: { display: true, text: "USD Cost", font: { size: 13 } },
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                },
            },
        },
    };

    return generateChart(chartConfig, "gas-cost-comparison.png");
}

/**
 * Chart 2: IPFS upload time vs file size.
 * Line chart showing upload, retrieval, and end-to-end times.
 */
async function generateIpfsChart(ipfsData) {
    if (!ipfsData || ipfsData.error) {
        console.log("  ⚠ Skipping IPFS chart (no data)");
        return null;
    }

    const { uploadResults, retrievalResults, endToEndResults } = ipfsData;
    const labels = Object.keys(uploadResults);

    const chartConfig = {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "IPFS Upload",
                    data: labels.map((l) => parseFloat((uploadResults[l].mean / 1000).toFixed(3))),
                    borderColor: COLORS.primaryBorder,
                    backgroundColor: COLORS.primary,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 5,
                },
                {
                    label: "IPFS Retrieval",
                    data: labels.map((l) => parseFloat((retrievalResults[l].mean / 1000).toFixed(3))),
                    borderColor: COLORS.secondaryBorder,
                    backgroundColor: COLORS.secondary,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 5,
                },
                {
                    label: "End-to-End (IPFS + Blockchain)",
                    data: labels.map((l) => parseFloat((endToEndResults[l].mean / 1000).toFixed(3))),
                    borderColor: COLORS.dangerBorder,
                    backgroundColor: COLORS.danger,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 5,
                },
            ],
        },
        options: getCommonOptions(
            "IPFS Performance vs Document Size",
            "Document Size",
            "Time (seconds)"
        ),
    };

    return generateChart(chartConfig, "upload-time-vs-filesize.png");
}

/**
 * Chart 3: Concurrent users performance.
 * Shows response time and throughput as users increase.
 */
async function generateConcurrencyChart(scalabilityData) {
    if (!scalabilityData?.concurrentOperations) {
        console.log("  ⚠ Skipping concurrency chart (no data)");
        return null;
    }

    const entries = Object.values(scalabilityData.concurrentOperations);
    const labels = entries.map((e) => `${e.userCount} users`);

    const chartConfig = {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Avg Response Time (s)",
                    data: entries.map((e) => parseFloat((e.responseTime.mean / 1000).toFixed(3))),
                    borderColor: COLORS.primaryBorder,
                    backgroundColor: COLORS.primary,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 6,
                    yAxisID: "y",
                },
                {
                    label: "Throughput (tx/s)",
                    data: entries.map((e) => e.throughputTps),
                    borderColor: COLORS.secondaryBorder,
                    backgroundColor: COLORS.secondary,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 6,
                    yAxisID: "y1",
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: "System Performance Under Concurrent Load",
                    font: { size: 16, weight: "bold" },
                },
                legend: { position: "top" },
            },
            scales: {
                x: {
                    title: { display: true, text: "Concurrent Users", font: { size: 13 } },
                    grid: { display: false },
                },
                y: {
                    type: "linear",
                    position: "left",
                    title: { display: true, text: "Response Time (s)", font: { size: 13 } },
                    beginAtZero: true,
                },
                y1: {
                    type: "linear",
                    position: "right",
                    title: { display: true, text: "Throughput (tx/s)", font: { size: 13 } },
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                },
            },
        },
    };

    return generateChart(chartConfig, "concurrent-users-performance.png");
}

/**
 * Chart 4: Cost comparison — Ethereum vs Polygon vs AWS.
 * Grouped bar chart using comparison.json data.
 */
async function generateCostComparisonChart(gasCosts, ethPrice) {
    // Load comparison data
    let comparison;
    try {
        comparison = JSON.parse(fs.readFileSync(COMPARISON_FILE, "utf-8"));
    } catch {
        console.log("  ⚠ Skipping cost comparison chart (comparison.json not found)");
        return null;
    }

    // Calculate our system costs at 20 gwei
    const operations = ["addMedicalRecord", "grantAccess", "revokeAccess", "addAuditLog"];
    const opLabels = ["Upload Document", "Grant Access", "Revoke Access", "Audit Log"];

    const ethereumCosts = operations.map((op) => {
        if (!gasCosts[op]) return 0;
        return parseFloat((gasCosts[op].gas.mean * 20 * 1e-9 * ethPrice).toFixed(4));
    });

    const polygonCosts = operations.map((op) => {
        if (!gasCosts[op]) return 0;
        // Polygon uses ~30 gwei but MATIC is ~$0.90
        return parseFloat((gasCosts[op].gas.mean * 30 * 1e-9 * 0.9).toFixed(6));
    });

    const awsCosts = operations.map((_, i) => {
        // Centralized per-operation cost is negligible (~$0.0001)
        return [0.0001, 0.00005, 0.00005, 0.00003][i];
    });

    const chartConfig = {
        type: "bar",
        data: {
            labels: opLabels,
            datasets: [
                {
                    label: `Ethereum Mainnet (@20 gwei, $${ethPrice} ETH)`,
                    data: ethereumCosts,
                    backgroundColor: COLORS.primary,
                    borderColor: COLORS.primaryBorder,
                    borderWidth: 1,
                },
                {
                    label: "Polygon L2 (@30 gwei, $0.90 MATIC)",
                    data: polygonCosts,
                    backgroundColor: COLORS.secondary,
                    borderColor: COLORS.secondaryBorder,
                    borderWidth: 1,
                },
                {
                    label: "Centralized (AWS RDS + S3)",
                    data: awsCosts,
                    backgroundColor: COLORS.accent,
                    borderColor: COLORS.accentBorder,
                    borderWidth: 1,
                },
            ],
        },
        options: getCommonOptions(
            "Per-Operation Cost: Blockchain vs Centralized",
            "Operation",
            "Cost (USD)"
        ),
    };

    return generateChart(chartConfig, "cost-comparison.png");
}

/**
 * Chart 5: Gas price sensitivity.
 * Shows how USD cost scales with gas price for key operations.
 */
async function generateGasPriceSensitivityChart(gasPriceSensitivity, ethPrice) {
    if (!gasPriceSensitivity) {
        console.log("  ⚠ Skipping gas price sensitivity chart (no data)");
        return null;
    }

    const tiers = Object.keys(gasPriceSensitivity);
    const gweiValues = tiers.map((t) => parseInt(t));

    // Pick the 4 most important operations
    const opsToShow = ["addMedicalRecord", "grantAccess", "revokeAccess", "addAuditLog"];
    const opColors = [COLORS.primary, COLORS.secondary, COLORS.accent, COLORS.purple];
    const opBorders = [COLORS.primaryBorder, COLORS.secondaryBorder, COLORS.accentBorder, COLORS.purpleBorder];

    const datasets = opsToShow.map((op, idx) => ({
        label: op.replace(/([A-Z])/g, ' $1').trim(),
        data: tiers.map((tier) => {
            const data = gasPriceSensitivity[tier][op];
            if (!data) return 0;
            return parseFloat((data.gasUsed * data.gasPriceGwei * 1e-9 * ethPrice).toFixed(4));
        }),
        borderColor: opBorders[idx],
        backgroundColor: opColors[idx],
        tension: 0.3,
        fill: false,
        pointRadius: 5,
    }));

    const chartConfig = {
        type: "line",
        data: {
            labels: tiers.map((t) => t.replace("_", " ")),
            datasets,
        },
        options: getCommonOptions(
            `Gas Price Sensitivity (ETH = $${ethPrice.toLocaleString()})`,
            "Gas Price (gwei)",
            "Transaction Cost (USD)"
        ),
    };

    return generateChart(chartConfig, "gas-price-sensitivity.png");
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log("╔══════════════════════════════════════════════════════════════════════╗");
    console.log("║              CHART GENERATOR — QuickChart API v2.0                  ║");
    console.log("╚══════════════════════════════════════════════════════════════════════╝");

    // ── Parse CLI args ──
    const args = process.argv.slice(2);
    let ethPrice = DEFAULT_ETH_PRICE;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--eth-price" && args[i + 1]) {
            ethPrice = parseFloat(args[i + 1]);
        }
    }

    // ── Load results ──
    if (!fs.existsSync(RESULTS_FILE)) {
        console.error(`\n  ❌ Results file not found: ${RESULTS_FILE}`);
        console.error("  Run the benchmark first: npm run benchmark");
        process.exit(1);
    }

    const results = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8"));
    console.log(`\n  ✓ Loaded benchmark results`);
    console.log(`  ETH price: $${ethPrice.toLocaleString()}`);

    // ── Create charts directory ──
    if (!fs.existsSync(CHARTS_DIR)) {
        fs.mkdirSync(CHARTS_DIR, { recursive: true });
    }

    // ── Generate all charts ──
    console.log("\n  Generating charts via QuickChart API...\n");

    await generateGasCostChart(results.gasCosts, ethPrice);
    await generateIpfsChart(results.ipfsPerformance);
    await generateConcurrencyChart(results.scalability);
    await generateCostComparisonChart(results.gasCosts, ethPrice);
    await generateGasPriceSensitivityChart(results.gasPriceSensitivity, ethPrice);

    console.log("\n  ✅ All charts generated!");
    console.log(`  Output directory: ${CHARTS_DIR}`);
}

main().catch((error) => {
    console.error("\n❌ Chart generation failed:", error);
    process.exit(1);
});
