const { ethers, upgrades } = require("hardhat");

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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
