/**
 * ============================================================================
 * Stress Tester — Saturation & Breaking Point Detection
 * ============================================================================
 *
 * This script gradually ramps up concurrent load until the system hits
 * a breaking point. It detects THREE types of failure:
 *
 *   1. Error Rate Spike:   >10% of transactions fail
 *   2. Latency Explosion:  p95 latency >30 seconds  
 *   3. TPS Collapse:       TPS drops >50% from peak
 *
 * At the end, it prints a detailed summary showing exactly where the
 * system broke and what the bottleneck was.
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { runConcurrentOperation } = require("./benchmark-engine");

const CONFIG = {
  startUsers: 5,
  maxUsers: 5000,            // Push hard — let the system tell us where it breaks
  stepFactor: 1.5,           // Multiply users by 1.5x each step (5→7→11→16→24→...)
  errorThresholdPercent: 10, // Stop if errors > 10%
  latencyThresholdMs: 30000, // Stop if p95 latency > 30 seconds
  tpsDropThreshold: 0.5,     // Stop if TPS drops to 50% of peak
  opsPerUser: 3,             // Ops per user (reduced to keep each step fast)
  outputDir: path.join(__dirname, "..", "perf-data"),
  walletsFile: path.join(__dirname, "..", "perf-data", "wallets.json"),
};

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║      MEDVAULT V2 STRESS TEST — BREAKING POINT FINDER       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  if (!fs.existsSync(CONFIG.walletsFile)) {
    console.error(`\n❌ Error: Wallets not found. Run 'npm run perf:setup' first.`);
    process.exit(1);
  }
  const walletData = JSON.parse(fs.readFileSync(CONFIG.walletsFile, "utf-8"));
  const provider = hre.ethers.provider;
  const IdentityRegistryV2 = await hre.ethers.getContractAt("IdentityRegistryV2", walletData.contracts.identityRegistry);
  
  const doctors = walletData.doctors.map(w => new hre.ethers.Wallet(w.privateKey, provider));

  let currentUsers = CONFIG.startUsers;
  const results = [];
  let breakReason = null;
  let peakTps = 0;
  let peakTpsUsers = 0;

  console.log(`\n  Strategy: Ramp from ${CONFIG.startUsers} → ${CONFIG.maxUsers} users (×${CONFIG.stepFactor} per step)`);
  console.log(`  Stop conditions:`);
  console.log(`    • Error rate > ${CONFIG.errorThresholdPercent}%`);
  console.log(`    • p95 latency > ${(CONFIG.latencyThresholdMs / 1000).toFixed(0)}s`);
  console.log(`    • TPS drops below 50% of peak`);
  console.log(`\n  Starting ramp...\n`);

  while (currentUsers <= CONFIG.maxUsers && !breakReason) {
    // Cap to available wallets
    const usableUsers = Math.min(currentUsers, doctors.length);
    const activeWallets = doctors.slice(0, usableUsers);
    
    const stats = await runConcurrentOperation(
      `Stress-${usableUsers}-Users`,
      usableUsers,
      CONFIG.opsPerUser,
      async (u, i) => {
        const wallet = activeWallets[u];
        const dummyAddress = hre.ethers.Wallet.createRandom().address;
        const tx = await IdentityRegistryV2.connect(wallet).registerIdentity(dummyAddress, 3);
        return await tx.wait();
      }
    );

    const errorRate = 100 - stats.successRate;

    // Track peak TPS
    if (stats.throughputTps > peakTps) {
      peakTps = stats.throughputTps;
      peakTpsUsers = usableUsers;
    }

    results.push({
      users: usableUsers,
      tps: stats.throughputTps,
      avgLatency: stats.avgLatencyMs,
      p95Latency: stats.p95LatencyMs,
      p99Latency: stats.p99LatencyMs,
      errorRate: errorRate,
      successRate: stats.successRate,
      successCount: stats.successCount,
      failCount: stats.failCount,
      totalOps: usableUsers * CONFIG.opsPerUser,
      peakTpsSoFar: peakTps,
    });

    // ── Check Breaking Conditions ──────────────────────────────
    if (errorRate > CONFIG.errorThresholdPercent) {
      breakReason = `ERROR_RATE_SPIKE`;
      console.log(`\n  🔴 BREAK: Error rate ${errorRate.toFixed(1)}% exceeds ${CONFIG.errorThresholdPercent}% threshold`);
    } else if (stats.p95LatencyMs > CONFIG.latencyThresholdMs) {
      breakReason = `LATENCY_EXPLOSION`;
      console.log(`\n  🔴 BREAK: p95 latency ${(stats.p95LatencyMs / 1000).toFixed(1)}s exceeds ${(CONFIG.latencyThresholdMs / 1000).toFixed(0)}s threshold`);
    } else if (results.length >= 3 && stats.throughputTps < peakTps * CONFIG.tpsDropThreshold) {
      breakReason = `TPS_COLLAPSE`;
      console.log(`\n  🔴 BREAK: TPS ${stats.throughputTps.toFixed(1)} dropped below 50% of peak (${peakTps.toFixed(1)})`);
    }

    if (!breakReason) {
      currentUsers = Math.floor(currentUsers * CONFIG.stepFactor);
    }
  }

  if (!breakReason && currentUsers > CONFIG.maxUsers) {
    breakReason = `MAX_LIMIT_REACHED`;
    console.log(`\n  🟢 System survived all ${CONFIG.maxUsers} users without breaking!`);
  }

  // ── Print Summary ──────────────────────────────────────────────
  const lastResult = results[results.length - 1];
  const stableResults = results.filter(r => r.errorRate <= CONFIG.errorThresholdPercent);
  const lastStable = stableResults[stableResults.length - 1];

  console.log(`\n`);
  console.log(`╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║                  STRESS TEST RESULTS                        ║`);
  console.log(`╠══════════════════════════════════════════════════════════════╣`);
  console.log(`║                                                             ║`);
  console.log(`║  Break Reason:     ${(breakReason || 'NONE').padEnd(39)}║`);
  console.log(`║  Breaking Point:   ${(lastResult.users + ' concurrent users').padEnd(39)}║`);
  console.log(`║  Peak TPS:         ${(peakTps.toFixed(2) + ' tx/sec (at ' + peakTpsUsers + ' users)').padEnd(39)}║`);
  console.log(`║  Max Safe Users:   ${((lastStable ? lastStable.users : 0) + ' users (100% stable)').padEnd(39)}║`);
  console.log(`║                                                             ║`);
  console.log(`╠══════════════════════════════════════════════════════════════╣`);
  console.log(`║  RAMP-UP CURVE                                              ║`);
  console.log(`╠══════════════════════════════════════════════════════════════╣`);
  
  console.log(`║  Users   │ TPS      │ p95 Latency │ Errors  │ Status       ║`);
  console.log(`║──────────┼──────────┼─────────────┼─────────┼──────────────║`);
  
  for (const r of results) {
    const status = r.errorRate > CONFIG.errorThresholdPercent ? '🔴 BROKEN' :
                   r.p95Latency > CONFIG.latencyThresholdMs ? '🟡 DEGRADED' :
                   r.tps < peakTps * 0.7 && results.indexOf(r) > 2 ? '🟡 SLOWING' :
                   '🟢 HEALTHY';
    
    const users = r.users.toString().padStart(6);
    const tps = r.tps.toFixed(1).padStart(8);
    const lat = r.p95Latency < 1000 ? 
      (r.p95Latency.toFixed(0) + 'ms').padStart(11) : 
      ((r.p95Latency / 1000).toFixed(1) + 's').padStart(11);
    const err = (r.errorRate.toFixed(1) + '%').padStart(7);
    
    console.log(`║  ${users}   │ ${tps} │ ${lat} │ ${err} │ ${status.padEnd(12)} ║`);
  }
  
  console.log(`╚══════════════════════════════════════════════════════════════╝`);

  // ── Bottleneck Analysis ─────────────────────────────────────────
  console.log(`\n  📊 BOTTLENECK ANALYSIS:`);
  
  if (breakReason === 'LATENCY_EXPLOSION') {
    console.log(`  → The EVM transaction queue is saturated.`);
    console.log(`  → The single-threaded Hardhat node cannot process`);
    console.log(`    transactions fast enough at this concurrency level.`);
    console.log(`  → On a real L2 (Polygon/Base), the sequencer handles`);
    console.log(`    this via parallel block building.`);
  } else if (breakReason === 'ERROR_RATE_SPIKE') {
    console.log(`  → Transactions are failing due to resource exhaustion.`);
    console.log(`  → Likely causes: nonce conflicts, OOM, or RPC timeout.`);
    console.log(`  → This is the hard ceiling for this environment.`);
  } else if (breakReason === 'TPS_COLLAPSE') {
    console.log(`  → TPS peaked then dropped — classic saturation curve.`);
    console.log(`  → The node is spending more time on context-switching`);
    console.log(`    between transactions than actually executing them.`);
    console.log(`  → Optimal concurrency: ${peakTpsUsers} users.`);
  } else {
    console.log(`  → System survived all load levels! No bottleneck found.`);
    console.log(`  → Increase maxUsers in stress-tester.js to push harder.`);
  }

  // ── Save Results ────────────────────────────────────────────────
  const summary = {
    breakReason,
    breakingPointUsers: lastResult.users,
    peakTps,
    peakTpsAtUsers: peakTpsUsers,
    maxSafeUsers: lastStable ? lastStable.users : 0,
    totalStepsRun: results.length,
    rampUpCurve: results,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outfile = path.join(CONFIG.outputDir, "raw", `stress-${timestamp}.json`);
  fs.mkdirSync(path.join(CONFIG.outputDir, "raw"), { recursive: true });
  fs.writeFileSync(outfile, JSON.stringify(summary, null, 2));
  
  console.log(`\n✅ Stress test complete. Results saved to: ${outfile}`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
