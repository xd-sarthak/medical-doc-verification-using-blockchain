/**
 * ============================================================================
 * Cost Comparator — L1 vs L2 vs Web2 Costs
 * ============================================================================
 *
 * Translates raw gas units into USD costs across Ethereum Mainnet,
 * Polygon, Base, and AWS equivalents.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "perf-data");

const PRICES = {
  ETH_USD: 3500,
  MATIC_USD: 0.90,
  ETH_GAS_GWEI: 15,
  BASE_GAS_GWEI: 0.01,
  POLYGON_GAS_GWEI: 30
};

// AWS Equivalent Cost Per Operation (Approximate)
// RDS Write + S3 Upload + Lambda execution
const AWS_COST_PER_OP = {
  registerIdentity: 0.00005,
  grantConsent: 0.00003,
  createRecord: 0.0001,
};

function calculateCostUsd(gasUnits, gasPriceGwei, tokenPriceUsd) {
  return gasUnits * gasPriceGwei * 1e-9 * tokenPriceUsd;
}

async function main() {
  console.log("Generating Cost Comparison...");
  const latestBench = path.join(DATA_DIR, "latest-benchmark.json");
  if (!fs.existsSync(latestBench)) return console.error("No benchmark data.");

  const data = JSON.parse(fs.readFileSync(latestBench, "utf-8"));
  // Use tier 1 gas costs as baseline
  const tier1 = data.tier_1;
  
  const ops = {
    registerIdentity: 98000, // Estimated from previous runs since our bench tests createRecord/grantConsent
    grantConsent: tier1.grantConsent.avgGasUsed,
    createRecord: tier1.createRecord.avgGasUsed
  };

  const results = {};
  
  for (const [op, gas] of Object.entries(ops)) {
    results[op] = {
      gasUnits: gas,
      ethMainnetUsd: calculateCostUsd(gas, PRICES.ETH_GAS_GWEI, PRICES.ETH_USD),
      baseL2Usd: calculateCostUsd(gas, PRICES.BASE_GAS_GWEI, PRICES.ETH_USD),
      polygonUsd: calculateCostUsd(gas, PRICES.POLYGON_GAS_GWEI, PRICES.MATIC_USD),
      awsUsd: AWS_COST_PER_OP[op] || 0.0001
    };
  }

  const outfile = path.join(DATA_DIR, "raw", "cost-comparison.json");
  fs.writeFileSync(outfile, JSON.stringify(results, null, 2));
  
  console.log("✅ Cost comparison complete.");
  console.table(results);
}

if (require.main === module) main();
module.exports = { main };
