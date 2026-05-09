/**
 * ============================================================================
 * Stress Tester — Saturation & Breaking Point Detection
 * ============================================================================
 *
 * This script gradually ramps up concurrent load until the system hits
 * a breaking point (>10% error rate) or a predefined hard limit.
 *
 * Output is used to generate the "Saturation Curve" showing where TPS
 * plateaus and latency/errors spike.
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { runConcurrentOperation } = require("./benchmark-engine");

const CONFIG = {
  startUsers: 10,
  maxUsers: 500, // Hard limit to avoid out-of-memory
  stepFactor: 1.5, // Multiply users by 1.5x each step
  errorThresholdPercent: 10, // Stop if errors > 10%
  opsPerUser: 5,
  outputDir: path.join(__dirname, "..", "perf-data"),
  walletsFile: path.join(__dirname, "..", "perf-data", "wallets.json"),
};

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           MEDVAULT V2 STRESS TEST (SATURATION)               ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  if (!fs.existsSync(CONFIG.walletsFile)) {
    console.error(`\n❌ Error: Wallets not found. Run 'node perf/wallet-generator.js' first.`);
    process.exit(1);
  }
  const walletData = JSON.parse(fs.readFileSync(CONFIG.walletsFile, "utf-8"));
  const provider = hre.ethers.provider;
  const IdentityRegistryV2 = await hre.ethers.getContractAt("IdentityRegistryV2", walletData.contracts.identityRegistry);
  
  // We'll just stress test registerIdentity for simplicity, as it's a representative state write
  const doctors = walletData.doctors.map(w => new hre.ethers.Wallet(w.privateKey, provider));

  let currentUsers = CONFIG.startUsers;
  const results = [];
  let broken = false;

  console.log(`\n  Ramping load starting at ${currentUsers} users...`);

  while (currentUsers <= CONFIG.maxUsers && !broken) {
    const activeWallets = doctors.slice(0, currentUsers);
    
    const stats = await runConcurrentOperation(
      `Stress-Step-${currentUsers}-Users`,
      currentUsers,
      CONFIG.opsPerUser,
      async (u, i) => {
        const wallet = activeWallets[u];
        // Generate random address to avoid "already exists" errors
        const dummyAddress = hre.ethers.Wallet.createRandom().address;
        const tx = await IdentityRegistryV2.connect(wallet).registerIdentity(dummyAddress, 3);
        return await tx.wait();
      }
    );

    results.push({
      users: currentUsers,
      tps: stats.throughputTps,
      p95Latency: stats.p95LatencyMs,
      errorRate: 100 - stats.successRate,
      totalOps: currentUsers * CONFIG.opsPerUser
    });

    if (100 - stats.successRate > CONFIG.errorThresholdPercent) {
      console.log(`\n  ⚠️ Breaking point reached at ${currentUsers} users (Error rate > ${CONFIG.errorThresholdPercent}%)`);
      broken = true;
    } else {
      currentUsers = Math.floor(currentUsers * CONFIG.stepFactor);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outfile = path.join(CONFIG.outputDir, "raw", `stress-${timestamp}.json`);
  fs.writeFileSync(outfile, JSON.stringify(results, null, 2));
  
  console.log(`\n✅ Stress test complete. Results saved to: ${outfile}`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
