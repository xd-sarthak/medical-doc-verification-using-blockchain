async function main() {
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const ConsentLedger = await ethers.getContractFactory("ConsentLedger");
  const RecordRegistry = await ethers.getContractFactory("RecordRegistry");

  console.log("Deploying IdentityRegistry...");
  const identityRegistry = await IdentityRegistry.deploy();
  const identityRegistryAddress = await identityRegistry.getAddress();
  console.log("IdentityRegistry:", identityRegistryAddress);

  console.log("Deploying ConsentLedger...");
  const consentLedger = await ConsentLedger.deploy(identityRegistryAddress);
  const consentLedgerAddress = await consentLedger.getAddress();
  console.log("ConsentLedger:", consentLedgerAddress);

  console.log("Deploying RecordRegistry...");
  const recordRegistry = await RecordRegistry.deploy(identityRegistryAddress, consentLedgerAddress);
  const recordRegistryAddress = await recordRegistry.getAddress();
  console.log("RecordRegistry:", recordRegistryAddress);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
