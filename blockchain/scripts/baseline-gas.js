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

  const AuditFactory = await hre.ethers.getContractFactory("HealthcareAudit");
  const audit = await AuditFactory.deploy();
  await audit.waitForDeployment();

  const DoctorFactory = await hre.ethers.getContractFactory("DoctorManagement");
  const doctor = await DoctorFactory.deploy();
  await doctor.waitForDeployment();

  const PatientFactory = await hre.ethers.getContractFactory("PatientManagement");
  const patient = await PatientFactory.deploy();
  await patient.waitForDeployment();

  return { admin, signers, audit, doctor, patient };
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
  const { admin, signers, audit, doctor, patient } = await deployContracts();

  const baselinePatientSigners = signers.slice(0, ITERATIONS);
  const baselineDoctorSigners = signers.slice(ITERATIONS, ITERATIONS * 2);

  if (baselinePatientSigners.length < ITERATIONS || baselineDoctorSigners.length < ITERATIONS) {
    throw new Error("Not enough test signers available for baseline benchmark");
  }

  const registerPatient = await measureGas("registerPatient", async (i) => {
    return patient.connect(admin).registerPatient(
      baselinePatientSigners[i].address,
      `patient_${i}`,
      "patient"
    );
  });

  const registerDoctor = await measureGas("registerDoctor", async (i) => {
    return doctor.connect(admin).registerDoctor(
      baselineDoctorSigners[i].address,
      `doctor_${i}`,
      "doctor"
    );
  });

  const addMedicalRecord = await measureGas("addMedicalRecord", async (i) => {
    return patient.connect(admin).addMedicalRecord(
      baselinePatientSigners[0].address,
      `QmBaselineHash${i}`,
      "application/pdf",
      `report_${i}.pdf`,
      `Baseline Report ${i}`,
      `Baseline benchmark medical record iteration ${i}`,
      ""
    );
  });

  const grantAccess = await measureGas("addPatientAccess", async (i) => {
    return doctor.connect(admin).addPatientAccess(
      baselineDoctorSigners[i].address,
      baselinePatientSigners[i].address
    );
  });

  const revokeAccess = await measureGas("revokePatientAccess", async (i) => {
    return doctor.connect(baselinePatientSigners[i]).revokePatientAccess(
      baselineDoctorSigners[i].address,
      baselinePatientSigners[i].address
    );
  });

  const addAuditLog = await measureGas("addAuditLog", async (i) => {
    return audit.connect(admin).addAuditLog(
      admin.address,
      "RECORD_ADDED",
      baselinePatientSigners[0].address,
      `Baseline audit entry ${i}`
    );
  });

  const results = {
    generatedAt: new Date().toISOString(),
    network: hre.network.name,
    iterations: ITERATIONS,
    operations: {
      registerPatient,
      registerDoctor,
      addMedicalRecord,
      grantAccess,
      revokeAccess,
      addAuditLog,
    },
  };

  const outputPath = path.join(__dirname, "..", "data", "baseline-gas-results.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log("\nBaseline gas benchmark results");
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
