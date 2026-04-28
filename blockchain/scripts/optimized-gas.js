const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ITERATIONS = 5;

function calculateStats(values) {
  if (!values.length) {
    return { mean: 0, min: 0, max: 0, stddev: 0, count: 0, raw: [] };
  }

  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (n - 1 || 1);

  return {
    mean: Number(mean.toFixed(2)),
    min: Math.min(...values),
    max: Math.max(...values),
    stddev: Number(Math.sqrt(variance).toFixed(2)),
    count: n,
    raw: values,
  };
}

async function deployContracts() {
  const [admin, ...signers] = await hre.ethers.getSigners();

  const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy();
  await identityRegistry.waitForDeployment();

  const ConsentLedger = await hre.ethers.getContractFactory("ConsentLedger");
  const consentLedger = await ConsentLedger.deploy(await identityRegistry.getAddress());
  await consentLedger.waitForDeployment();

  const RecordRegistry = await hre.ethers.getContractFactory("RecordRegistry");
  const recordRegistry = await RecordRegistry.deploy(
    await identityRegistry.getAddress(),
    await consentLedger.getAddress()
  );
  await recordRegistry.waitForDeployment();

  return { admin, signers, identityRegistry, consentLedger, recordRegistry };
}

async function measureGas(label, fn) {
  const values = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const tx = await fn(i);
    const receipt = await tx.wait();
    values.push(Number(receipt.gasUsed));
  }

  return {
    label,
    iterations: ITERATIONS,
    gas: calculateStats(values),
  };
}

async function main() {
  const { admin, signers, identityRegistry, consentLedger, recordRegistry } = await deployContracts();

  const patients = signers.slice(0, ITERATIONS);
  const doctors = signers.slice(ITERATIONS, ITERATIONS * 2);

  if (patients.length < ITERATIONS || doctors.length < ITERATIONS) {
    throw new Error("Not enough test signers available for optimized benchmark");
  }

  const ROLE_DOCTOR = 2;
  const ROLE_PATIENT = 3;
  const SCOPE_UPLOAD = 2;

  const registerPatients = await measureGas("optimizedRegisterPatientIdentity", async (i) => {
    return identityRegistry.connect(admin).registerIdentity(patients[i].address, ROLE_PATIENT);
  });

  const registerDoctors = await measureGas("optimizedRegisterDoctorIdentity", async (i) => {
    return identityRegistry.connect(admin).registerIdentity(doctors[i].address, ROLE_DOCTOR);
  });

  const currentBlock = await hre.ethers.provider.getBlock("latest");
  const expiryBase = Number(currentBlock.timestamp) + 3600;

  const grantConsent = await measureGas("grantConsent", async (i) => {
    return consentLedger.connect(patients[i]).grantConsent(
      doctors[i].address,
      SCOPE_UPLOAD,
      expiryBase + i
    );
  });

  const createRecord = await measureGas("createRecord", async (i) => {
    return recordRegistry.connect(doctors[i]).createRecord(
      patients[i].address,
      hre.ethers.id(`document-${i}`),
      hre.ethers.id(`metadata-${i}`)
    );
  });

  const revokeConsent = await measureGas("revokeConsent", async (i) => {
    return consentLedger.connect(patients[i]).revokeConsent(
      doctors[i].address,
      hre.ethers.id(`reason-${i}`)
    );
  });

  const versionScenario = await deployContracts();
  const versionPatients = versionScenario.signers.slice(0, ITERATIONS);
  const versionDoctors = versionScenario.signers.slice(ITERATIONS, ITERATIONS * 2);

  for (let i = 0; i < ITERATIONS; i++) {
    await versionScenario.identityRegistry.connect(versionScenario.admin).registerIdentity(versionPatients[i].address, ROLE_PATIENT);
    await versionScenario.identityRegistry.connect(versionScenario.admin).registerIdentity(versionDoctors[i].address, ROLE_DOCTOR);
    await versionScenario.consentLedger.connect(versionPatients[i]).grantConsent(
      versionDoctors[i].address,
      SCOPE_UPLOAD,
      expiryBase + 100 + i
    );
  }

  const versionSeedRecordIds = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const tx = await versionScenario.recordRegistry.connect(versionDoctors[i]).createRecord(
      versionPatients[i].address,
      hre.ethers.id(`seed-document-${i}`),
      hre.ethers.id(`seed-metadata-${i}`)
    );
    const receipt = await tx.wait();
    const parsedLog = receipt.logs
      .map((log) => {
        try {
          return versionScenario.recordRegistry.interface.parseLog(log);
        } catch (error) {
          return null;
        }
      })
      .find((log) => log && log.name === "RecordCreated");

    versionSeedRecordIds.push(parsedLog.args.recordId);
  }

  const updateRecord = await measureGas("updateRecord", async (i) => {
    return versionScenario.recordRegistry.connect(versionDoctors[i]).updateRecord(
      versionSeedRecordIds[i],
      hre.ethers.id(`updated-document-${i}`),
      hre.ethers.id(`updated-metadata-${i}`)
    );
  });

  const revokeScenario = await deployContracts();
  const revokePatients = revokeScenario.signers.slice(0, ITERATIONS);
  const revokeDoctors = revokeScenario.signers.slice(ITERATIONS, ITERATIONS * 2);

  for (let i = 0; i < ITERATIONS; i++) {
    await revokeScenario.identityRegistry.connect(revokeScenario.admin).registerIdentity(revokePatients[i].address, ROLE_PATIENT);
    await revokeScenario.identityRegistry.connect(revokeScenario.admin).registerIdentity(revokeDoctors[i].address, ROLE_DOCTOR);
    await revokeScenario.consentLedger.connect(revokePatients[i]).grantConsent(
      revokeDoctors[i].address,
      SCOPE_UPLOAD,
      expiryBase + 500 + i
    );
  }

  const revokeSeedRecordIds = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const tx = await revokeScenario.recordRegistry.connect(revokeDoctors[i]).createRecord(
      revokePatients[i].address,
      hre.ethers.id(`revoke-document-${i}`),
      hre.ethers.id(`revoke-metadata-${i}`)
    );
    const receipt = await tx.wait();
    const parsedLog = receipt.logs
      .map((log) => {
        try {
          return revokeScenario.recordRegistry.interface.parseLog(log);
        } catch (error) {
          return null;
        }
      })
      .find((log) => log && log.name === "RecordCreated");

    revokeSeedRecordIds.push(parsedLog.args.recordId);
  }

  const revokeRecord = await measureGas("revokeRecord", async (i) => {
    return revokeScenario.recordRegistry.connect(revokePatients[i]).revokeRecord(
      revokeSeedRecordIds[i],
      hre.ethers.id(`record-reason-${i}`)
    );
  });

  const results = {
    generatedAt: new Date().toISOString(),
    network: hre.network.name,
    iterations: ITERATIONS,
    operations: {
      registerPatients,
      registerDoctors,
      grantConsent,
      createRecord,
      revokeConsent,
      updateRecord,
      revokeRecord,
    },
  };

  const outputPath = path.join(__dirname, "..", "data", "optimized-gas-results.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log("\nOptimized gas benchmark results");
  for (const [key, value] of Object.entries(results.operations)) {
    console.log(
      `${key}: mean=${value.gas.mean}, min=${value.gas.min}, max=${value.gas.max}, stddev=${value.gas.stddev}`
    );
  }
  console.log(`\nSaved to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
