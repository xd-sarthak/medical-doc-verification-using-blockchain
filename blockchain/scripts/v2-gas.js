const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * V2 Gas Benchmark Script
 * Measures gas consumption for all V2 contract operations.
 * Outputs results to data/v2-gas-results.json
 */
async function main() {
  const [admin, doctor, patient] = await ethers.getSigners();

  // Deploy V2 stack
  const IdentityRegistryV2 = await ethers.getContractFactory("IdentityRegistryV2");
  const registry = await IdentityRegistryV2.deploy();
  await registry.waitForDeployment();

  const ConsentLedgerV2 = await ethers.getContractFactory("ConsentLedgerV2");
  const consent = await ConsentLedgerV2.deploy(await registry.getAddress());
  await consent.waitForDeployment();

  const RecordRegistryV2 = await ethers.getContractFactory("RecordRegistryV2");
  const records = await RecordRegistryV2.deploy(
    await registry.getAddress(),
    await consent.getAddress()
  );
  await records.waitForDeployment();

  console.log("V2 contracts deployed. Running benchmarks...\n");

  const results = {};

  // ── registerIdentity (Doctor) ──
  {
    const tx = await registry.registerIdentity(doctor.address, 2);
    const receipt = await tx.wait();
    results.registerIdentity_Doctor = Number(receipt.gasUsed);
    console.log(`registerIdentity (Doctor): ${receipt.gasUsed} gas`);
  }

  // ── registerIdentity (Patient) ──
  {
    const tx = await registry.registerIdentity(patient.address, 3);
    const receipt = await tx.wait();
    results.registerIdentity_Patient = Number(receipt.gasUsed);
    console.log(`registerIdentity (Patient): ${receipt.gasUsed} gas`);
  }

  // ── grantConsent ──
  {
    const latestBlock = await ethers.provider.getBlock("latest");
    const expiry = latestBlock.timestamp + 86400;
    const tx = await consent.connect(patient).grantConsent(doctor.address, 2, expiry);
    const receipt = await tx.wait();
    results.grantConsent = Number(receipt.gasUsed);
    console.log(`grantConsent: ${receipt.gasUsed} gas`);
  }

  // ── createRecord ──
  const docHash = ethers.id("benchmark-document-v1");
  const metaHash = ethers.id("benchmark-metadata-v1");
  {
    const tx = await records.connect(doctor).createRecord(patient.address, docHash, metaHash);
    const receipt = await tx.wait();
    results.createRecord = Number(receipt.gasUsed);
    console.log(`createRecord: ${receipt.gasUsed} gas`);
  }

  // ── updateRecord ──
  const docHash2 = ethers.id("benchmark-document-v2");
  const metaHash2 = ethers.id("benchmark-metadata-v2");
  {
    const tx = await records.connect(doctor).updateRecord(1, docHash2, metaHash2);
    const receipt = await tx.wait();
    results.updateRecord = Number(receipt.gasUsed);
    console.log(`updateRecord: ${receipt.gasUsed} gas`);
  }

  // ── revokeRecord ──
  {
    const tx = await records.connect(patient).revokeRecord(2, ethers.id("benchmark-revoke"));
    const receipt = await tx.wait();
    results.revokeRecord = Number(receipt.gasUsed);
    console.log(`revokeRecord: ${receipt.gasUsed} gas`);
  }

  // ── revokeConsent ──
  {
    const tx = await consent.connect(patient).revokeConsent(doctor.address, ethers.id("benchmark-revoke-consent"));
    const receipt = await tx.wait();
    results.revokeConsent = Number(receipt.gasUsed);
    console.log(`revokeConsent: ${receipt.gasUsed} gas`);
  }

  // ── hasValidConsent (view, no gas cost but measure execution) ──
  {
    results.hasValidConsent = "view (no gas)";
  }

  // Write results
  const outputDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(outputDir, { recursive: true });

  const payload = {
    version: "v2",
    optimizer: "enabled (runs=200)",
    timestamp: new Date().toISOString(),
    network: network.name,
    results,
  };

  fs.writeFileSync(
    path.join(outputDir, "v2-gas-results.json"),
    JSON.stringify(payload, null, 2)
  );

  console.log(`\n✅ Results written to data/v2-gas-results.json`);

  // Print comparison table
  const baseline = {
    registerIdentity: 98223,
    grantConsent: 93419,
    createRecord: 268717,
    revokeConsent: 34960,
  };
  const optimized = {
    registerIdentity: 47718,
    grantConsent: 84445,
    createRecord: 190627,
    updateRecord: 181401,
    revokeConsent: 27598,
    revokeRecord: 42448,
  };

  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║                    3-WAY GAS COMPARISON                            ║");
  console.log("╠═══════════════════╦═══════════╦════════════╦═══════════╦════════════╣");
  console.log("║ Operation         ║ Baseline  ║ Optimized  ║ V2        ║ V2 vs Base ║");
  console.log("╠═══════════════════╬═══════════╬════════════╬═══════════╬════════════╣");

  const ops = [
    ["registerIdentity", results.registerIdentity_Doctor, baseline.registerIdentity, optimized.registerIdentity],
    ["grantConsent", results.grantConsent, baseline.grantConsent, optimized.grantConsent],
    ["createRecord", results.createRecord, baseline.createRecord, optimized.createRecord],
    ["updateRecord", results.updateRecord, null, optimized.updateRecord],
    ["revokeConsent", results.revokeConsent, baseline.revokeConsent, optimized.revokeConsent],
    ["revokeRecord", results.revokeRecord, null, optimized.revokeRecord],
  ];

  for (const [name, v2, base, opt] of ops) {
    const baseStr = base ? base.toString().padStart(9) : "      N/A";
    const optStr = opt ? opt.toString().padStart(10) : "       N/A";
    const v2Str = v2.toString().padStart(9);
    const pct = base ? `${((1 - v2 / base) * 100).toFixed(1)}%`.padStart(10) : "       N/A";
    console.log(`║ ${name.padEnd(17)} ║ ${baseStr} ║ ${optStr} ║ ${v2Str} ║ ${pct} ║`);
  }

  console.log("╚═══════════════════╩═══════════╩════════════╩═══════════╩════════════╝");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
