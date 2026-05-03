const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * V2 Production Deploy Script — Direct (non-proxy) deployment.
 *
 * Deploys the gas-optimized V2 contract stack without proxy overhead:
 *   1. IdentityRegistryV2
 *   2. ConsentLedgerV2 (depends on IdentityRegistryV2)
 *   3. RecordRegistryV2 (depends on both)
 *
 * Writes deployment artifacts to:
 *   - blockchain/deployments/{network}.json
 *   - Web App/src/config/contracts.json
 */

function writeDeploymentArtifacts(addresses, abis) {
  const blockchainOutputDir = path.join(__dirname, "..", "deployments");
  const frontendOutputDir = path.join(__dirname, "..", "..", "Web App", "src", "config");

  fs.mkdirSync(blockchainOutputDir, { recursive: true });
  fs.mkdirSync(frontendOutputDir, { recursive: true });

  const payload = {
    version: "v2",
    mode: "prod-direct",
    network: network.name,
    updatedAt: new Date().toISOString(),
    ...addresses,
  };

  // Write addresses
  fs.writeFileSync(
    path.join(blockchainOutputDir, `${network.name}.json`),
    JSON.stringify(payload, null, 2)
  );
  fs.writeFileSync(
    path.join(frontendOutputDir, "contracts.json"),
    JSON.stringify(payload, null, 2)
  );

  // Write ABIs for frontend
  for (const [name, abi] of Object.entries(abis)) {
    fs.writeFileSync(
      path.join(frontendOutputDir, `${name}.json`),
      JSON.stringify(abi, null, 2)
    );
  }

  console.log(`\n✅ Artifacts written to:`);
  console.log(`   ${blockchainOutputDir}/${network.name}.json`);
  console.log(`   ${frontendOutputDir}/contracts.json`);
  console.log(`   ${frontendOutputDir}/ (ABIs)`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying V2 contracts (prod-direct) with account: ${deployer.address}`);
  console.log(`Network: ${network.name}\n`);

  // 1. IdentityRegistryV2
  const IdentityRegistryV2 = await ethers.getContractFactory("IdentityRegistryV2");
  const identityRegistry = await IdentityRegistryV2.deploy();
  await identityRegistry.waitForDeployment();
  const identityRegistryAddress = await identityRegistry.getAddress();
  console.log(`IdentityRegistryV2 deployed to: ${identityRegistryAddress}`);

  // 2. ConsentLedgerV2
  const ConsentLedgerV2 = await ethers.getContractFactory("ConsentLedgerV2");
  const consentLedger = await ConsentLedgerV2.deploy(identityRegistryAddress);
  await consentLedger.waitForDeployment();
  const consentLedgerAddress = await consentLedger.getAddress();
  console.log(`ConsentLedgerV2 deployed to:    ${consentLedgerAddress}`);

  // 3. RecordRegistryV2
  const RecordRegistryV2 = await ethers.getContractFactory("RecordRegistryV2");
  const recordRegistry = await RecordRegistryV2.deploy(identityRegistryAddress, consentLedgerAddress);
  await recordRegistry.waitForDeployment();
  const recordRegistryAddress = await recordRegistry.getAddress();
  console.log(`RecordRegistryV2 deployed to:   ${recordRegistryAddress}`);

  // Extract ABIs from compiled artifacts
  const abis = {
    identityRegistryABI: IdentityRegistryV2.interface.formatJson(),
    consentLedgerABI: ConsentLedgerV2.interface.formatJson(),
    recordRegistryABI: RecordRegistryV2.interface.formatJson(),
  };

  // Parse the JSON strings back to arrays for clean output
  const parsedAbis = {};
  for (const [name, abiJson] of Object.entries(abis)) {
    parsedAbis[name] = JSON.parse(abiJson);
  }

  writeDeploymentArtifacts(
    {
      identityRegistry: identityRegistryAddress,
      consentLedger: consentLedgerAddress,
      recordRegistry: recordRegistryAddress,
    },
    parsedAbis
  );

  console.log(`\n🎉 V2 deployment complete.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
