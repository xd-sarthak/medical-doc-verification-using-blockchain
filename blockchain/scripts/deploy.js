const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

function writeDeploymentArtifacts(addresses) {
  const blockchainOutputDir = path.join(__dirname, "..", "deployments");
  const frontendOutputDir = path.join(__dirname, "..", "..", "Web App", "src", "config");

  fs.mkdirSync(blockchainOutputDir, { recursive: true });
  fs.mkdirSync(frontendOutputDir, { recursive: true });

  const payload = {
    network: network.name,
    updatedAt: new Date().toISOString(),
    ...addresses,
  };

  fs.writeFileSync(
    path.join(blockchainOutputDir, `${network.name}.json`),
    JSON.stringify(payload, null, 2)
  );
  fs.writeFileSync(
    path.join(frontendOutputDir, "contracts.json"),
    JSON.stringify(payload, null, 2)
  );
}

async function main() {
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const ConsentLedger = await ethers.getContractFactory("ConsentLedger");
  const RecordRegistry = await ethers.getContractFactory("RecordRegistry");

  console.log("Deploying IdentityRegistry proxy...");
  const identityRegistry = await upgrades.deployProxy(IdentityRegistry, [], { kind: 'uups' });
  await identityRegistry.waitForDeployment();
  const identityRegistryAddress = await identityRegistry.getAddress();
  console.log("IdentityRegistry proxy deployed to:", identityRegistryAddress);

  console.log("Deploying ConsentLedger proxy...");
  const consentLedger = await upgrades.deployProxy(ConsentLedger, [identityRegistryAddress], { kind: 'uups' });
  await consentLedger.waitForDeployment();
  const consentLedgerAddress = await consentLedger.getAddress();
  console.log("ConsentLedger proxy deployed to:", consentLedgerAddress);

  console.log("Deploying RecordRegistry proxy...");
  const recordRegistry = await upgrades.deployProxy(RecordRegistry, [identityRegistryAddress, consentLedgerAddress], { kind: 'uups' });
  await recordRegistry.waitForDeployment();
  const recordRegistryAddress = await recordRegistry.getAddress();
  console.log("RecordRegistry proxy deployed to:", recordRegistryAddress);

  writeDeploymentArtifacts({
    identityRegistry: identityRegistryAddress,
    consentLedger: consentLedgerAddress,
    recordRegistry: recordRegistryAddress,
  });
  console.log(`Deployment artifacts written for network: ${network.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
