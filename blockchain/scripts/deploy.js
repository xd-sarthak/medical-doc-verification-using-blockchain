async function main() {
  const Audit = await ethers.getContractFactory("HealthcareAudit");
  const Doctor = await ethers.getContractFactory("DoctorManagement");
  const Patient = await ethers.getContractFactory("PatientManagement");

  console.log("Deploying HealthcareAudit...");
  const audit = await Audit.deploy();
  console.log("AuditContract:", await audit.getAddress());

  console.log("Deploying DoctorManagement...");
  const doctor = await Doctor.deploy();
  console.log("DoctorContract:", await doctor.getAddress());

  console.log("Deploying PatientManagement...");
  const patient = await Patient.deploy();
  console.log("PatientContract:", await patient.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
