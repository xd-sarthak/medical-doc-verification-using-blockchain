/**
 * ============================================================================
 * Gas Cost Analysis & Performance Benchmarking Suite
 * ============================================================================
 * 
 * Medical Document Management System — Ethereum + IPFS
 * 
 * This script measures:
 *   1. Gas cost for every smart contract write operation
 *   2. Gas price sensitivity (5–200 gwei)
 *   3. IPFS upload/retrieval latency for varying document sizes
 *   4. End-to-end latency (IPFS upload + on-chain storage)
 *   5. Scalability under concurrent load (10/50/100 users)
 * 
 * Methodology:
 *   - Each operation is repeated N times (configurable, default = 5)
 *   - Statistics: mean, stddev, min, max, 95% confidence interval
 *   - Results saved to data/benchmark-results.json
 *   - Checkpoint file for resumability
 * 
 * Usage:
 *   npx hardhat run scripts/benchmark.js --network hardhat
 * 
 * Prerequisites:
 *   - Hardhat local node (runs in-process when using --network hardhat)
 *   - IPFS Docker container: docker run -d -p 5001:5001 -p 8080:8080 ipfs/kubo
 * 
 * @author Benchmarking Suite for BTech FYP
 * @version 2.0
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// ============================================================================
// CONFIGURATION — Adjust these parameters for your benchmarking runs
// ============================================================================

const CONFIG = {
  // Number of iterations per test (higher = more accurate, slower)
  iterations: 5,

  // Document sizes for IPFS tests (in bytes)
  fileSizes: [
    { label: "1KB", bytes: 1024 },
    { label: "100KB", bytes: 102400 },
    { label: "1MB", bytes: 1048576 },
    { label: "5MB", bytes: 5242880 },
  ],

  // Gas prices to test sensitivity (in gwei)
  gasPrices: [5, 20, 50, 100, 200],

  // Concurrency tiers for scalability testing
  concurrencyTiers: [10, 50, 100],

  // Document accumulation counts for scalability
  documentCounts: [10, 100, 500, 1000],

  // IPFS API endpoint
  ipfsApiUrl: "http://127.0.0.1:5001",

  // Default ETH price (USD) — used if CoinGecko is unavailable
  defaultEthPrice: 3500,

  // Default gas price (gwei) for cost calculations
  defaultGasPrice: 20,

  // Output paths
  outputDir: path.join(__dirname, "..", "data"),
  resultsFile: "benchmark-results.json",
  checkpointFile: "benchmark-checkpoint.json",
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculates descriptive statistics including 95% confidence interval.
 * 
 * The 95% CI uses the t-distribution approximation (z=1.96) which is
 * acceptable for n >= 5. For smaller samples, a t-table lookup would
 * be more accurate, but the difference is negligible for our purposes.
 * 
 * @param {number[]} values - Array of numeric measurements
 * @returns {Object} Statistics object with mean, stddev, min, max, ci95
 */
function calculateStats(values) {
  if (!values || values.length === 0) {
    return { mean: 0, stddev: 0, min: 0, max: 0, ci95Lower: 0, ci95Upper: 0, count: 0 };
  }

  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;

  // Population standard deviation (using n-1 for sample correction)
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1 || 1);
  const stddev = Math.sqrt(variance);

  // 95% confidence interval: mean ± (1.96 * stddev / sqrt(n))
  const marginOfError = 1.96 * (stddev / Math.sqrt(n));

  return {
    mean: parseFloat(mean.toFixed(6)),
    stddev: parseFloat(stddev.toFixed(6)),
    min: parseFloat(Math.min(...values).toFixed(6)),
    max: parseFloat(Math.max(...values).toFixed(6)),
    ci95Lower: parseFloat((mean - marginOfError).toFixed(6)),
    ci95Upper: parseFloat((mean + marginOfError).toFixed(6)),
    count: n,
    raw: values,
  };
}

/**
 * Generates a random buffer of specified size to simulate medical documents.
 * In a real scenario, these would be PDF/DICOM files; for benchmarking
 * purposes, random bytes produce equivalent IPFS/network behavior.
 * 
 * @param {number} sizeBytes - Size of the buffer to generate
 * @returns {Buffer} Random byte buffer
 */
function generateMockDocument(sizeBytes) {
  const buffer = Buffer.alloc(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  return buffer;
}

/**
 * High-resolution timer (milliseconds).
 * Uses process.hrtime.bigint() for nanosecond precision.
 */
function now() {
  return Number(process.hrtime.bigint()) / 1e6; // ns → ms
}

/**
 * Formats milliseconds into a human-readable duration string.
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

/**
 * Prints a progress bar to the console.
 * 
 * @param {string} label - What is being measured
 * @param {number} current - Current iteration
 * @param {number} total - Total iterations
 */
function showProgress(label, current, total) {
  const pct = ((current / total) * 100).toFixed(0);
  const bar = "█".repeat(Math.floor(current / total * 30)).padEnd(30, "░");
  process.stdout.write(`\r  [${bar}] ${pct}% | ${label} (${current}/${total})`);
  if (current === total) console.log(); // newline at completion
}

/**
 * Ensures the output directory exists.
 */
function ensureOutputDir() {
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }
}

/**
 * Saves a checkpoint so the benchmark can be resumed if interrupted.
 * 
 * @param {string} phase - Current phase name
 * @param {Object} data - Accumulated results so far
 */
function saveCheckpoint(phase, data) {
  const checkpointPath = path.join(CONFIG.outputDir, CONFIG.checkpointFile);
  fs.writeFileSync(checkpointPath, JSON.stringify({
    phase,
    timestamp: new Date().toISOString(),
    data,
  }, null, 2));
}

/**
 * Loads a previous checkpoint if it exists.
 * 
 * @returns {Object|null} Checkpoint data or null
 */
function loadCheckpoint() {
  const checkpointPath = path.join(CONFIG.outputDir, CONFIG.checkpointFile);
  if (fs.existsSync(checkpointPath)) {
    try {
      return JSON.parse(fs.readFileSync(checkpointPath, "utf-8"));
    } catch {
      return null;
    }
  }
  return null;
}

// ============================================================================
// IPFS HELPER FUNCTIONS
// ============================================================================

/**
 * Checks if the IPFS node is accessible at the configured API endpoint.
 * This is a hard requirement — the benchmark will abort if IPFS is down.
 * 
 * @returns {Promise<boolean>} True if IPFS is reachable
 */
async function checkIpfsConnection() {
  try {
    const response = await fetch(`${CONFIG.ipfsApiUrl}/api/v0/id`, { method: "POST" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    console.log(`  ✓ IPFS node connected: ${data.ID.substring(0, 16)}...`);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Uploads a buffer to IPFS and returns the CID (content hash).
 * Uses the /api/v0/add endpoint with multipart form data.
 * 
 * @param {Buffer} buffer - File content to upload
 * @returns {Promise<{hash: string, timeMs: number}>} IPFS hash and upload duration
 */
async function uploadToIpfs(buffer) {
  const startTime = now();

  // Build multipart form data manually (no external dependency)
  const boundary = "----BenchmarkBoundary" + Date.now();
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="benchmark-doc"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(header),
    buffer,
    Buffer.from(footer),
  ]);

  const response = await fetch(`${CONFIG.ipfsApiUrl}/api/v0/add`, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: body,
  });

  if (!response.ok) {
    throw new Error(`IPFS upload failed: HTTP ${response.status}`);
  }

  const result = await response.json();
  const timeMs = now() - startTime;

  return { hash: result.Hash, timeMs };
}

/**
 * Retrieves a file from IPFS by its CID (hash).
 * Uses the /api/v0/cat endpoint.
 * 
 * @param {string} hash - IPFS content hash (CID)
 * @returns {Promise<{sizeBytes: number, timeMs: number}>} Retrieved size and duration
 */
async function retrieveFromIpfs(hash) {
  const startTime = now();

  const response = await fetch(`${CONFIG.ipfsApiUrl}/api/v0/cat?arg=${hash}`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`IPFS retrieval failed: HTTP ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const timeMs = now() - startTime;

  return { sizeBytes: buffer.byteLength, timeMs };
}

// ============================================================================
// CONTRACT DEPLOYMENT
// ============================================================================

/**
 * Deploys all three smart contracts and returns their instances.
 * Uses the same deployment pattern as the project's deploy.js script.
 * 
 * @returns {Promise<Object>} Object containing deployed contract instances
 */
async function deployContracts() {
  console.log("\n📋 Deploying Smart Contracts...");

  const [admin, ...signers] = await hre.ethers.getSigners();
  console.log(`  Admin: ${admin.address}`);
  console.log(`  Available test accounts: ${signers.length}`);

  // Deploy HealthcareAudit
  const AuditFactory = await hre.ethers.getContractFactory("HealthcareAudit");
  const audit = await AuditFactory.deploy();
  await audit.waitForDeployment();
  const auditAddress = await audit.getAddress();
  console.log(`  ✓ HealthcareAudit deployed at: ${auditAddress}`);

  // Deploy DoctorManagement
  const DoctorFactory = await hre.ethers.getContractFactory("DoctorManagement");
  const doctor = await DoctorFactory.deploy();
  await doctor.waitForDeployment();
  const doctorAddress = await doctor.getAddress();
  console.log(`  ✓ DoctorManagement deployed at: ${doctorAddress}`);

  // Deploy PatientManagement
  const PatientFactory = await hre.ethers.getContractFactory("PatientManagement");
  const patient = await PatientFactory.deploy();
  await patient.waitForDeployment();
  const patientAddress = await patient.getAddress();
  console.log(`  ✓ PatientManagement deployed at: ${patientAddress}`);

  return { audit, doctor, patient, admin, signers };
}

// ============================================================================
// PHASE 1: GAS COST ANALYSIS
// ============================================================================

/**
 * Measures gas consumption for every write operation across all 3 contracts.
 * 
 * Each operation is executed CONFIG.iterations times. Gas is measured from
 * the transaction receipt's gasUsed field, which is deterministic on Hardhat.
 * 
 * Operations tested:
 *   PatientManagement: registerPatient, addMedicalRecord
 *   DoctorManagement:  registerDoctor, addPatientAccess, revokePatientAccess
 *   HealthcareAudit:   addAuditLog
 */
async function runGasCostAnalysis(contracts) {
  console.log("\n" + "=".repeat(70));
  console.log("  PHASE 1: GAS COST ANALYSIS");
  console.log("=".repeat(70));

  const { audit, doctor, patient, admin, signers } = contracts;
  const results = {};

  // ── 1a. Register Patient ──────────────────────────────────────────────
  console.log("\n  Testing: registerPatient()");
  const registerPatientGas = [];
  const registerPatientTime = [];

  for (let i = 0; i < CONFIG.iterations; i++) {
    showProgress("registerPatient", i + 1, CONFIG.iterations);
    const addr = signers[i] ? signers[i].address : hre.ethers.Wallet.createRandom().address;
    const startTime = now();
    const tx = await patient.connect(admin).registerPatient(addr, `patient_${i}`, "patient");
    const receipt = await tx.wait();
    registerPatientTime.push(now() - startTime);
    registerPatientGas.push(Number(receipt.gasUsed));
  }

  results.registerPatient = {
    gas: calculateStats(registerPatientGas),
    time: calculateStats(registerPatientTime),
    contract: "PatientManagement",
    description: "Register a new patient in the system",
  };

  // ── 1b. Register Doctor ───────────────────────────────────────────────
  console.log("  Testing: registerDoctor()");
  const registerDoctorGas = [];
  const registerDoctorTime = [];

  for (let i = 0; i < CONFIG.iterations; i++) {
    showProgress("registerDoctor", i + 1, CONFIG.iterations);
    // Use signers from the upper range to avoid collision with patients
    const addr = signers[CONFIG.iterations + i]
      ? signers[CONFIG.iterations + i].address
      : hre.ethers.Wallet.createRandom().address;
    const startTime = now();
    const tx = await doctor.connect(admin).registerDoctor(addr, `doctor_${i}`, "doctor");
    const receipt = await tx.wait();
    registerDoctorTime.push(now() - startTime);
    registerDoctorGas.push(Number(receipt.gasUsed));
  }

  results.registerDoctor = {
    gas: calculateStats(registerDoctorGas),
    time: calculateStats(registerDoctorTime),
    contract: "DoctorManagement",
    description: "Register a new doctor in the system",
  };

  // ── 1c. Add Medical Record (Upload Document) ─────────────────────────
  // This is the most expensive operation: stores IPFS hash + metadata on-chain
  console.log("  Testing: addMedicalRecord()");
  const addRecordGas = [];
  const addRecordTime = [];

  // We need a registered patient for this test
  const testPatientAddr = signers[0].address; // Already registered above

  for (let i = 0; i < CONFIG.iterations; i++) {
    showProgress("addMedicalRecord", i + 1, CONFIG.iterations);
    const fakeIpfsHash = `QmTest${i}Hash${Date.now()}${Math.random().toString(36).substring(7)}`;
    const startTime = now();
    const tx = await patient.connect(admin).addMedicalRecord(
      testPatientAddr,
      fakeIpfsHash,
      "application/pdf",            // fileType
      `medical_report_${i}.pdf`,    // fileName
      `Blood Test Report #${i}`,    // title
      `Routine blood work results for benchmark test iteration ${i}`, // resume
      ""                            // previousVersion (empty = new record)
    );
    const receipt = await tx.wait();
    addRecordTime.push(now() - startTime);
    addRecordGas.push(Number(receipt.gasUsed));
  }

  results.addMedicalRecord = {
    gas: calculateStats(addRecordGas),
    time: calculateStats(addRecordTime),
    contract: "PatientManagement",
    description: "Store a new medical document hash + metadata on-chain",
  };

  // ── 1d. Grant Access (addPatientAccess) ───────────────────────────────
  console.log("  Testing: addPatientAccess()");
  const grantAccessGas = [];
  const grantAccessTime = [];

  for (let i = 0; i < CONFIG.iterations; i++) {
    showProgress("addPatientAccess", i + 1, CONFIG.iterations);

    // Use different doctor-patient pairs each iteration to avoid "already granted"
    const doctorAddr = signers[CONFIG.iterations + i]
      ? signers[CONFIG.iterations + i].address
      : hre.ethers.Wallet.createRandom().address;
    const patientAddr = signers[i].address;

    const startTime = now();
    const tx = await doctor.connect(admin).addPatientAccess(doctorAddr, patientAddr);
    const receipt = await tx.wait();
    grantAccessTime.push(now() - startTime);
    grantAccessGas.push(Number(receipt.gasUsed));
  }

  results.grantAccess = {
    gas: calculateStats(grantAccessGas),
    time: calculateStats(grantAccessTime),
    contract: "DoctorManagement",
    description: "Grant a doctor access to a patient's records",
  };

  // ── 1e. Revoke Access (revokePatientAccess) ───────────────────────────
  // Note: Only the patient can revoke access (msg.sender == _patientAddress)
  console.log("  Testing: revokePatientAccess()");
  const revokeAccessGas = [];
  const revokeAccessTime = [];

  for (let i = 0; i < CONFIG.iterations; i++) {
    showProgress("revokePatientAccess", i + 1, CONFIG.iterations);

    const doctorAddr = signers[CONFIG.iterations + i]
      ? signers[CONFIG.iterations + i].address
      : hre.ethers.Wallet.createRandom().address;
    const patientSigner = signers[i]; // Patient must be msg.sender

    const startTime = now();
    const tx = await doctor.connect(patientSigner).revokePatientAccess(doctorAddr, patientSigner.address);
    const receipt = await tx.wait();
    revokeAccessTime.push(now() - startTime);
    revokeAccessGas.push(Number(receipt.gasUsed));
  }

  results.revokeAccess = {
    gas: calculateStats(revokeAccessGas),
    time: calculateStats(revokeAccessTime),
    contract: "DoctorManagement",
    description: "Revoke a doctor's access to a patient's records",
  };

  // ── 1f. Add Audit Log ─────────────────────────────────────────────────
  console.log("  Testing: addAuditLog()");
  const auditLogGas = [];
  const auditLogTime = [];

  for (let i = 0; i < CONFIG.iterations; i++) {
    showProgress("addAuditLog", i + 1, CONFIG.iterations);
    const startTime = now();
    const tx = await audit.connect(admin).addAuditLog(
      admin.address,
      "RECORD_ADDED",
      signers[0].address,
      `Benchmark audit entry #${i} — addMedicalRecord performed`
    );
    const receipt = await tx.wait();
    auditLogTime.push(now() - startTime);
    auditLogGas.push(Number(receipt.gasUsed));
  }

  results.addAuditLog = {
    gas: calculateStats(auditLogGas),
    time: calculateStats(auditLogTime),
    contract: "HealthcareAudit",
    description: "Log an audit trail entry for compliance tracking",
  };

  return results;
}

// ============================================================================
// PHASE 2: GAS PRICE SENSITIVITY
// ============================================================================

/**
 * Tests how varying gas prices affect the USD cost of each operation.
 * 
 * This is crucial for the research paper because Ethereum gas prices fluctuate
 * significantly (5 gwei during low-activity periods to 200+ gwei during
 * congestion). This test shows the operational cost range users would face.
 * 
 * Note: On Hardhat local network, gasPrice doesn't affect gasUsed (gas
 * consumption is deterministic). We calculate USD cost as:
 *   cost_USD = gasUsed × gasPrice_gwei × 1e-9 × ETH_price_USD
 */
async function runGasPriceSensitivity(contracts, gasCostResults) {
  console.log("\n" + "=".repeat(70));
  console.log("  PHASE 2: GAS PRICE SENSITIVITY ANALYSIS");
  console.log("=".repeat(70));

  const results = {};

  // For each gas price tier, calculate the cost of each operation
  // using the average gasUsed measured in Phase 1
  for (const gpGwei of CONFIG.gasPrices) {
    console.log(`\n  Gas Price: ${gpGwei} gwei`);
    results[`${gpGwei}_gwei`] = {};

    for (const [opName, opData] of Object.entries(gasCostResults)) {
      const avgGas = opData.gas.mean;
      // USD cost = gasUsed × gasPrice (in ETH) × ETH price
      const costEth = avgGas * gpGwei * 1e-9;
      const costUsd = costEth * CONFIG.defaultEthPrice;

      results[`${gpGwei}_gwei`][opName] = {
        gasUsed: avgGas,
        gasPriceGwei: gpGwei,
        costEth: parseFloat(costEth.toFixed(8)),
        costUsd: parseFloat(costUsd.toFixed(4)),
      };

      console.log(`    ${opName}: ${avgGas.toFixed(0)} gas → $${costUsd.toFixed(4)}`);
    }
  }

  return results;
}

// ============================================================================
// PHASE 3: IPFS PERFORMANCE
// ============================================================================

/**
 * Measures IPFS upload and retrieval performance for varying document sizes.
 * 
 * IPFS is a HARD REQUIREMENT. If the IPFS node is not running, this phase
 * aborts with a clear error message and Docker startup instructions.
 * 
 * Test methodology:
 *   1. Generate random buffers of each size (simulating medical documents)
 *   2. Upload each buffer to IPFS, timing the operation
 *   3. Retrieve each uploaded file by CID, timing the retrieval
 *   4. Measure end-to-end time: IPFS upload + on-chain hash storage
 */
async function runIpfsPerformance(contracts) {
  console.log("\n" + "=".repeat(70));
  console.log("  PHASE 3: IPFS PERFORMANCE BENCHMARKS");
  console.log("=".repeat(70));

  // ── Hard requirement: check IPFS connectivity ──────────────────────────
  console.log("\n  Checking IPFS connection...");
  const ipfsAlive = await checkIpfsConnection();

  if (!ipfsAlive) {
    console.error("\n  ❌ IPFS node is NOT running!");
    console.error("  ─────────────────────────────────────────────────────");
    console.error("  IPFS is a HARD REQUIREMENT for this benchmark.");
    console.error("  Start the IPFS Docker container with:");
    console.error("");
    console.error("    docker run -d --name ipfs_node \\");
    console.error("      -p 5001:5001 -p 8080:8080 \\");
    console.error("      ipfs/kubo");
    console.error("");
    console.error("  Then re-run this benchmark.");
    console.error("  ─────────────────────────────────────────────────────");

    return {
      error: "IPFS_NOT_AVAILABLE",
      message: "IPFS node is not running. Start with: docker run -d --name ipfs_node -p 5001:5001 -p 8080:8080 ipfs/kubo",
      uploadResults: null,
      retrievalResults: null,
      endToEndResults: null,
    };
  }

  const { patient, admin, signers } = contracts;
  const testPatientAddr = signers[0].address;

  const uploadResults = {};
  const retrievalResults = {};
  const endToEndResults = {};

  for (const sizeConfig of CONFIG.fileSizes) {
    console.log(`\n  File Size: ${sizeConfig.label}`);

    const uploadTimes = [];
    const retrievalTimes = [];
    const e2eTimes = [];

    for (let i = 0; i < CONFIG.iterations; i++) {
      showProgress(`${sizeConfig.label} upload+retrieve`, i + 1, CONFIG.iterations);

      try {
        // Step 1: Generate mock document
        const docBuffer = generateMockDocument(sizeConfig.bytes);

        // Step 2: Upload to IPFS (timed)
        const uploadResult = await uploadToIpfs(docBuffer);
        uploadTimes.push(uploadResult.timeMs);

        // Step 3: Store hash on blockchain (timed as end-to-end)
        const e2eStart = now();
        const tx = await patient.connect(admin).addMedicalRecord(
          testPatientAddr,
          uploadResult.hash,
          "application/pdf",
          `benchmark_${sizeConfig.label}_${i}.pdf`,
          `Benchmark Document ${sizeConfig.label}`,
          `Performance test document of size ${sizeConfig.label}`,
          ""
        );
        await tx.wait();
        // End-to-end = IPFS upload time + blockchain tx time
        e2eTimes.push(uploadResult.timeMs + (now() - e2eStart));

        // Step 4: Retrieve from IPFS (timed)
        const retrievalResult = await retrieveFromIpfs(uploadResult.hash);
        retrievalTimes.push(retrievalResult.timeMs);
      } catch (error) {
        console.error(`\n  ⚠ Error during ${sizeConfig.label} iteration ${i}: ${error.message}`);
      }
    }

    uploadResults[sizeConfig.label] = {
      sizeBytes: sizeConfig.bytes,
      ...calculateStats(uploadTimes),
    };
    retrievalResults[sizeConfig.label] = {
      sizeBytes: sizeConfig.bytes,
      ...calculateStats(retrievalTimes),
    };
    endToEndResults[sizeConfig.label] = {
      sizeBytes: sizeConfig.bytes,
      ...calculateStats(e2eTimes),
    };

    console.log(`    Upload avg: ${formatDuration(uploadResults[sizeConfig.label].mean)}`);
    console.log(`    Retrieval avg: ${formatDuration(retrievalResults[sizeConfig.label].mean)}`);
    console.log(`    End-to-end avg: ${formatDuration(endToEndResults[sizeConfig.label].mean)}`);
  }

  return {
    uploadResults,
    retrievalResults,
    endToEndResults,
  };
}

// ============================================================================
// PHASE 4: SCALABILITY TESTING
// ============================================================================

/**
 * Tests system behavior under increasing load.
 * 
 * Two sub-tests:
 *   A) Document Accumulation: Measures if gas costs change as the number
 *      of stored documents grows (10 → 100 → 500 → 1000).
 *   B) Concurrent Operations: Submits batches of transactions simultaneously
 *      using Promise.allSettled to measure throughput and success rate.
 * 
 * IMPORTANT NOTE FOR RESEARCH PAPER:
 *   Promise.allSettled measures client-side submission concurrency, NOT
 *   actual blockchain throughput. In a real Ethereum network, transactions
 *   enter the mempool and are processed sequentially within each block
 *   (block time ~12s, ~100 tx/block on mainnet). This test measures how
 *   well the system handles concurrent REQUEST submission, which is relevant
 *   for the application layer but not a measure of on-chain TPS.
 */
async function runScalabilityTests(contracts) {
  console.log("\n" + "=".repeat(70));
  console.log("  PHASE 4: SCALABILITY TESTING");
  console.log("=".repeat(70));

  const { audit, patient, doctor, admin, signers } = contracts;

  // ── 4a. Document Accumulation ─────────────────────────────────────────
  console.log("\n  ── Document Accumulation Test ──");
  console.log("  Measures how gas cost changes as document count grows.\n");

  // Deploy a fresh contract to isolate this test
  const FreshPatientFactory = await hre.ethers.getContractFactory("PatientManagement");
  const freshPatient = await FreshPatientFactory.deploy();
  await freshPatient.waitForDeployment();

  // Register a test patient in the fresh contract
  const accumTestPatient = signers[0].address;
  await (await freshPatient.connect(admin).registerPatient(accumTestPatient, "accum_patient", "patient")).wait();

  const accumulationResults = {};
  let documentsStored = 0;

  for (const targetCount of CONFIG.documentCounts) {
    const docsToAdd = targetCount - documentsStored;
    console.log(`  Adding ${docsToAdd} documents to reach ${targetCount} total...`);

    const gasMeasurements = [];
    const timeMeasurements = [];

    for (let i = 0; i < docsToAdd; i++) {
      const hash = `QmAccum${targetCount}_${i}_${Date.now()}${Math.random().toString(36).substr(2, 8)}`;
      const startTime = now();
      const tx = await freshPatient.connect(admin).addMedicalRecord(
        accumTestPatient,
        hash,
        "application/pdf",
        `doc_${documentsStored + i}.pdf`,
        `Document #${documentsStored + i}`,
        `Scalability test document, total target: ${targetCount}`,
        ""
      );
      const receipt = await tx.wait();
      timeMeasurements.push(now() - startTime);
      gasMeasurements.push(Number(receipt.gasUsed));

      // Show progress for larger batches
      if (docsToAdd > 20 && (i + 1) % Math.ceil(docsToAdd / 20) === 0) {
        showProgress(`Storing documents`, i + 1, docsToAdd);
      }
    }

    documentsStored = targetCount;

    // Take the last 5 measurements for the gas cost at this accumulation level
    const lastN = Math.min(5, gasMeasurements.length);
    const recentGas = gasMeasurements.slice(-lastN);
    const recentTime = timeMeasurements.slice(-lastN);

    accumulationResults[`${targetCount}_docs`] = {
      totalDocuments: targetCount,
      gas: calculateStats(recentGas),
      time: calculateStats(recentTime),
    };

    console.log(`    Gas at ${targetCount} docs: ${calculateStats(recentGas).mean.toFixed(0)} (avg of last ${lastN})`);
  }

  // ── 4b. Concurrent Operations ─────────────────────────────────────────
  console.log("\n  ── Concurrent Operations Test ──");
  console.log("  Measures throughput under simultaneous transaction submission.\n");

  const concurrencyResults = {};

  for (const userCount of CONFIG.concurrencyTiers) {
    console.log(`  Simulating ${userCount} concurrent users...`);

    // Deploy a fresh audit contract for isolation
    const FreshAuditFactory = await hre.ethers.getContractFactory("HealthcareAudit");
    const freshAudit = await FreshAuditFactory.deploy();
    await freshAudit.waitForDeployment();

    // Create an array of concurrent addAuditLog transactions
    const startTime = now();
    const promises = [];

    for (let i = 0; i < userCount; i++) {
      // Each "user" submits an audit log entry
      const signer = signers[i % signers.length]; // Cycle through available signers
      promises.push(
        (async () => {
          const txStart = now();
          try {
            const tx = await freshAudit.connect(signer).addAuditLog(
              signer.address,
              "RECORD_ADDED",
              admin.address,
              `Concurrent test entry from user ${i}`
            );
            const receipt = await tx.wait();
            return {
              success: true,
              gasUsed: Number(receipt.gasUsed),
              timeMs: now() - txStart,
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
              timeMs: now() - txStart,
            };
          }
        })()
      );
    }

    const results = await Promise.allSettled(promises);
    const totalTime = now() - startTime;

    // Analyze results
    const fulfilled = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);
    const successful = fulfilled.filter((r) => r.success);
    const failed = fulfilled.filter((r) => !r.success);
    const responseTimes = successful.map((r) => r.timeMs);

    concurrencyResults[`${userCount}_users`] = {
      userCount,
      totalTimeMs: totalTime,
      successCount: successful.length,
      failCount: failed.length + results.filter((r) => r.status === "rejected").length,
      successRate: parseFloat(((successful.length / userCount) * 100).toFixed(2)),
      responseTime: calculateStats(responseTimes),
      throughputTps: parseFloat((successful.length / (totalTime / 1000)).toFixed(2)),
    };

    console.log(`    Success rate: ${concurrencyResults[`${userCount}_users`].successRate}%`);
    console.log(`    Avg response: ${formatDuration(concurrencyResults[`${userCount}_users`].responseTime.mean)}`);
    console.log(`    Throughput: ${concurrencyResults[`${userCount}_users`].throughputTps} tx/s`);
  }

  return {
    documentAccumulation: accumulationResults,
    concurrentOperations: concurrencyResults,
    note: "Concurrent tests measure client-side submission concurrency, not on-chain TPS. " +
          "Real Ethereum mainnet processes transactions sequentially within ~12s blocks.",
  };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║     GAS COST ANALYSIS & PERFORMANCE BENCHMARKING SUITE v2.0        ║");
  console.log("║     Medical Document Management System — Ethereum + IPFS           ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");
  console.log(`\n  Timestamp: ${new Date().toISOString()}`);
  console.log(`  Iterations per test: ${CONFIG.iterations}`);
  console.log(`  Gas prices to test: ${CONFIG.gasPrices.join(", ")} gwei`);
  console.log(`  File sizes: ${CONFIG.fileSizes.map((s) => s.label).join(", ")}`);
  console.log(`  Concurrency tiers: ${CONFIG.concurrencyTiers.join(", ")} users`);

  ensureOutputDir();

  // Check for existing checkpoint
  const checkpoint = loadCheckpoint();
  if (checkpoint) {
    console.log(`\n  ⏩ Found checkpoint from ${checkpoint.timestamp} (phase: ${checkpoint.phase})`);
    console.log(`  Resuming from checkpoint...`);
  }

  const allResults = checkpoint?.data || {};

  // ── Deploy Contracts ──────────────────────────────────────────────────
  const contracts = await deployContracts();

  // ── Phase 1: Gas Cost Analysis ────────────────────────────────────────
  if (!allResults.gasCosts) {
    allResults.gasCosts = await runGasCostAnalysis(contracts);
    saveCheckpoint("gasCosts", allResults);
    console.log("\n  ✓ Phase 1 complete — checkpoint saved");
  } else {
    console.log("\n  ⏩ Phase 1 loaded from checkpoint");
  }

  // ── Phase 2: Gas Price Sensitivity ────────────────────────────────────
  if (!allResults.gasPriceSensitivity) {
    allResults.gasPriceSensitivity = await runGasPriceSensitivity(contracts, allResults.gasCosts);
    saveCheckpoint("gasPriceSensitivity", allResults);
    console.log("\n  ✓ Phase 2 complete — checkpoint saved");
  } else {
    console.log("\n  ⏩ Phase 2 loaded from checkpoint");
  }

  // ── Phase 3: IPFS Performance ─────────────────────────────────────────
  if (!allResults.ipfsPerformance) {
    allResults.ipfsPerformance = await runIpfsPerformance(contracts);
    saveCheckpoint("ipfsPerformance", allResults);
    console.log("\n  ✓ Phase 3 complete — checkpoint saved");
  } else {
    console.log("\n  ⏩ Phase 3 loaded from checkpoint");
  }

  // ── Phase 4: Scalability Testing ──────────────────────────────────────
  if (!allResults.scalability) {
    allResults.scalability = await runScalabilityTests(contracts);
    saveCheckpoint("scalability", allResults);
    console.log("\n  ✓ Phase 4 complete — checkpoint saved");
  } else {
    console.log("\n  ⏩ Phase 4 loaded from checkpoint");
  }

  // ── Save Final Results ────────────────────────────────────────────────
  allResults.metadata = {
    timestamp: new Date().toISOString(),
    config: {
      iterations: CONFIG.iterations,
      gasPrices: CONFIG.gasPrices,
      fileSizes: CONFIG.fileSizes.map((s) => s.label),
      concurrencyTiers: CONFIG.concurrencyTiers,
      documentCounts: CONFIG.documentCounts,
      defaultEthPrice: CONFIG.defaultEthPrice,
      defaultGasPrice: CONFIG.defaultGasPrice,
    },
    network: "hardhat-local",
    solidity: "0.8.20",
    contracts: {
      PatientManagement: "patientcontract.sol",
      DoctorManagement: "doctorcontract.sol",
      HealthcareAudit: "auditcontract.sol",
    },
  };

  const resultsPath = path.join(CONFIG.outputDir, CONFIG.resultsFile);
  fs.writeFileSync(resultsPath, JSON.stringify(allResults, null, 2));

  // Clean up checkpoint now that we have final results
  const checkpointPath = path.join(CONFIG.outputDir, CONFIG.checkpointFile);
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
  }

  // ── Print Summary ─────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║                        BENCHMARK COMPLETE                           ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");
  console.log(`\n  Results saved to: ${resultsPath}`);
  console.log(`\n  Next steps:`);
  console.log(`    1. npm run analyze           → Generate CSV + Markdown report`);
  console.log(`    2. npm run generate-graphs   → Generate PNG charts`);
  console.log(`    3. npm run benchmark:full     → Run entire pipeline`);

  // Quick summary table
  console.log("\n  ┌─────────────────────────┬──────────────┬──────────────┐");
  console.log("  │ Operation               │ Avg Gas      │ Avg Time     │");
  console.log("  ├─────────────────────────┼──────────────┼──────────────┤");
  for (const [name, data] of Object.entries(allResults.gasCosts)) {
    const gasStr = data.gas.mean.toFixed(0).padStart(10);
    const timeStr = formatDuration(data.time.mean).padStart(10);
    const nameStr = name.padEnd(23);
    console.log(`  │ ${nameStr} │ ${gasStr}   │ ${timeStr}   │`);
  }
  console.log("  └─────────────────────────┴──────────────┴──────────────┘");
}

// Run the benchmark
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Benchmark failed with error:");
    console.error(error);
    process.exit(1);
  });
