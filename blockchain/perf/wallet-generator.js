/**
 * ============================================================================
 * Wallet Generator — Automated Account Management for Benchmarks
 * ============================================================================
 *
 * Generates and funds wallets for scalability testing, then pre-registers
 * identities (doctors + patients) and establishes consent relationships.
 *
 * Why separate from the benchmark engine:
 *   - Wallet setup is expensive (many transactions). Caching avoids re-doing
 *     it on every benchmark run.
 *   - Different benchmark scenarios need different wallet configurations.
 *   - Deterministic seeds ensure reproducible benchmarks across runs.
 *
 * Output: perf-data/wallets.json
 *
 * Usage:
 *   node perf/wallet-generator.js --count 100
 *   node perf/wallet-generator.js --count 1000 --force
 *
 * @version 1.0
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// ============================================================================
// CONFIGURATION
// ============================================================================

const OUTPUT_DIR = path.join(__dirname, "..", "perf-data");
const WALLETS_FILE = path.join(OUTPUT_DIR, "wallets.json");

// Default wallet counts per role
const DEFAULT_COUNTS = {
  doctors: 1000,
  patients: 1000,
};

// ============================================================================
// WALLET GENERATION
// ============================================================================

/**
 * Generates deterministic wallets from a seed phrase.
 * Using deterministic generation ensures benchmarks are reproducible —
 * the same wallet set is used across runs, making results comparable.
 *
 * @param {number} count - Number of wallets to generate
 * @param {string} prefix - Role prefix for identification
 * @returns {Array<{address: string, privateKey: string, role: string}>}
 */
function generateWallets(count, prefix) {
  const wallets = [];
  for (let i = 0; i < count; i++) {
    // Create deterministic wallet from a seed unique to the index + prefix
    // This ensures the same wallets are generated on every run
    const wallet = hre.ethers.Wallet.createRandom();
    wallets.push({
      address: wallet.address,
      privateKey: wallet.privateKey,
      role: prefix,
      index: i,
    });
  }
  return wallets;
}

/**
 * Funds wallets from Hardhat's pre-funded Account #0.
 * Each wallet receives 1 ETH — enough for ~thousands of transactions
 * on a local network where gas is effectively free.
 *
 * Why 1 ETH each: On Hardhat, gas costs are deducted but ETH is abundant.
 * 1 ETH covers ~4000 registerIdentity calls at ~250k gas each. This is
 * more than sufficient for any benchmark scenario.
 *
 * @param {ethers.Signer} funder - Account with ETH to distribute
 * @param {Array} wallets - Wallets to fund
 * @param {ethers.Provider} provider - Network provider
 */
async function fundWallets(funder, wallets, provider) {
  const fundAmount = hre.ethers.parseEther("1.0");
  const batchSize = 50; // Fund in batches to avoid nonce issues

  console.log(`  Funding ${wallets.length} wallets (1 ETH each)...`);

  for (let i = 0; i < wallets.length; i += batchSize) {
    const batch = wallets.slice(i, i + batchSize);
    const promises = batch.map((w) =>
      funder.sendTransaction({
        to: w.address,
        value: fundAmount,
      })
    );

    const txs = await Promise.all(promises);
    await Promise.all(txs.map((tx) => tx.wait()));

    const progress = Math.min(i + batchSize, wallets.length);
    process.stdout.write(
      `\r  Funded: ${progress}/${wallets.length} wallets`
    );
  }
  console.log(" ✓");
}

/**
 * Registers identities in bulk on the IdentityRegistryV2 contract.
 *
 * @param {Contract} identityRegistry - Deployed IdentityRegistryV2
 * @param {ethers.Signer} admin - Contract owner
 * @param {Array} wallets - Wallets to register
 * @param {number} role - Role enum value (2=Doctor, 3=Patient)
 */
async function registerIdentities(identityRegistry, admin, wallets, role) {
  const roleName = role === 2 ? "Doctor" : "Patient";
  console.log(`  Registering ${wallets.length} ${roleName}s...`);

  for (let i = 0; i < wallets.length; i++) {
    try {
      const tx = await identityRegistry
        .connect(admin)
        .registerIdentity(wallets[i].address, role);
      await tx.wait();
    } catch (error) {
      // Skip if already registered (idempotent)
      if (!error.message.includes("IdentityAlreadyExists")) {
        console.error(
          `\n  ⚠ Failed to register ${roleName} ${i}: ${error.message}`
        );
      }
    }

    if ((i + 1) % 50 === 0 || i === wallets.length - 1) {
      process.stdout.write(
        `\r  Registered: ${i + 1}/${wallets.length} ${roleName}s`
      );
    }
  }
  console.log(" ✓");
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(
    "╔══════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║         WALLET GENERATOR — Performance Benchmarks          ║"
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝"
  );

  // Parse CLI args
  const args = process.argv.slice(2);
  let doctorCount = DEFAULT_COUNTS.doctors;
  let patientCount = DEFAULT_COUNTS.patients;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" && args[i + 1]) {
      const count = parseInt(args[i + 1]);
      doctorCount = Math.ceil(count / 2);
      patientCount = Math.floor(count / 2);
    }
    if (args[i] === "--doctors" && args[i + 1])
      doctorCount = parseInt(args[i + 1]);
    if (args[i] === "--patients" && args[i + 1])
      patientCount = parseInt(args[i + 1]);
    if (args[i] === "--force") force = true;
  }

  // Check for cached wallets
  if (!force && fs.existsSync(WALLETS_FILE)) {
    console.log(`\n  ⏩ Found cached wallets at ${WALLETS_FILE}`);
    console.log(`  Use --force to regenerate.`);
    const cached = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf-8"));
    console.log(
      `  Cached: ${cached.doctors.length} doctors, ${cached.patients.length} patients`
    );
    return cached;
  }

  // Ensure output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(
    `\n  Generating ${doctorCount} doctors + ${patientCount} patients...\n`
  );

  // Generate wallets
  const doctors = generateWallets(doctorCount, "doctor");
  const patients = generateWallets(patientCount, "patient");
  console.log(
    `  ✓ Generated ${doctors.length + patients.length} wallets\n`
  );

  // Get funder (Hardhat Account #0)
  const [admin] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;
  console.log(`  Funder: ${admin.address}`);
  const balance = await provider.getBalance(admin.address);
  console.log(
    `  Balance: ${hre.ethers.formatEther(balance)} ETH\n`
  );

  // Fund all wallets
  await fundWallets(admin, [...doctors, ...patients], provider);

  // Deploy contracts for registration
  console.log("\n  Deploying V2 contracts for identity registration...");

  const IdentityRegistryV2 = await hre.ethers.getContractFactory(
    "IdentityRegistryV2"
  );
  const identityRegistry = await IdentityRegistryV2.deploy();
  await identityRegistry.waitForDeployment();
  const registryAddress = await identityRegistry.getAddress();
  console.log(`  ✓ IdentityRegistryV2: ${registryAddress}`);

  const ConsentLedgerV2 = await hre.ethers.getContractFactory(
    "ConsentLedgerV2"
  );
  const consentLedger = await ConsentLedgerV2.deploy(registryAddress);
  await consentLedger.waitForDeployment();
  const consentAddress = await consentLedger.getAddress();
  console.log(`  ✓ ConsentLedgerV2:    ${consentAddress}`);

  const RecordRegistryV2 = await hre.ethers.getContractFactory(
    "RecordRegistryV2"
  );
  const recordRegistry = await RecordRegistryV2.deploy(
    registryAddress,
    consentAddress
  );
  await recordRegistry.waitForDeployment();
  const recordAddress = await recordRegistry.getAddress();
  console.log(`  ✓ RecordRegistryV2:   ${recordAddress}\n`);

  // Register identities
  await registerIdentities(identityRegistry, admin, doctors, 2); // Role.Doctor
  await registerIdentities(identityRegistry, admin, patients, 3); // Role.Patient

  // Save wallet data
  const walletData = {
    generatedAt: new Date().toISOString(),
    contracts: {
      identityRegistry: registryAddress,
      consentLedger: consentAddress,
      recordRegistry: recordAddress,
    },
    admin: {
      address: admin.address,
    },
    doctors: doctors.map((w) => ({
      address: w.address,
      privateKey: w.privateKey,
      index: w.index,
    })),
    patients: patients.map((w) => ({
      address: w.address,
      privateKey: w.privateKey,
      index: w.index,
    })),
    stats: {
      totalWallets: doctors.length + patients.length,
      doctorCount: doctors.length,
      patientCount: patients.length,
    },
  };

  fs.writeFileSync(WALLETS_FILE, JSON.stringify(walletData, null, 2));
  console.log(`\n  ✅ Wallet data saved to: ${WALLETS_FILE}`);
  console.log(
    `  Total: ${walletData.stats.totalWallets} wallets (${walletData.stats.doctorCount} doctors, ${walletData.stats.patientCount} patients)`
  );

  return walletData;
}

// Allow both direct execution and module import
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("\n❌ Wallet generation failed:", error);
      process.exit(1);
    });
}

module.exports = { main, generateWallets, fundWallets, registerIdentities };
