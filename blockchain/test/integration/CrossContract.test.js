const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Cross-Contract Integration", function () {
    let doctorContract, patientContract, auditContract;
    let admin, doctor, doctor2, doctor3, patient, patient2;

    beforeEach(async function () {
        [admin, doctor, doctor2, doctor3, patient, patient2] = await ethers.getSigners();

        const DoctorManagement = await ethers.getContractFactory("DoctorManagement");
        doctorContract = await DoctorManagement.deploy();

        const PatientManagement = await ethers.getContractFactory("PatientManagement");
        patientContract = await PatientManagement.deploy();

        const HealthcareAudit = await ethers.getContractFactory("HealthcareAudit");
        auditContract = await HealthcareAudit.deploy();
    });

    // =========================================================================
    // FULL USER JOURNEYS
    // =========================================================================

    describe("Complete Patient Workflow: Register → Upload → View", function () {
        it("should complete the patient journey end-to-end", async function () {
            // Register patient
            await patientContract.registerPatient(patient.address, "Alice", "patient");

            // Doctor uploads a record for the patient
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmHash1", "application/pdf", "blood_test.pdf",
                "Blood Test Results", "Annual blood work", ""
            );

            // Patient views their records
            const records = await patientContract.getMedicalRecords(patient.address);
            expect(records.length).to.equal(1);
            expect(records[0].title).to.equal("Blood Test Results");
            expect(records[0].doctor).to.equal(doctor.address);
            expect(records[0].isActive).to.be.true;
        });
    });

    describe("Complete Doctor Workflow: Register → Request Access → View Patients", function () {
        it("should complete the doctor journey end-to-end", async function () {
            // Admin registers doctor
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");

            // Grant access to patient
            await doctorContract.addPatientAccess(doctor.address, patient.address);

            // Doctor checks authorized patients
            const patients = await doctorContract.getAuthorizedPatients(doctor.address);
            expect(patients).to.include(patient.address);
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.true;
        });
    });

    describe("Patient-Doctor Interaction: Grant → Doctor Views → Revoke", function () {
        it("should complete the grant-view-revoke flow", async function () {
            // Setup
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            await patientContract.registerPatient(patient.address, "Alice", "patient");

            // Grant access
            await doctorContract.addPatientAccess(doctor.address, patient.address);

            // Doctor adds a record
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmHash1", "application/pdf", "report.pdf",
                "MRI Scan", "Brain MRI", ""
            );

            // Verify doctor can see patient
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.true;
            const patients = await doctorContract.getAuthorizedPatients(doctor.address);
            expect(patients).to.include(patient.address);

            // Patient revokes
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);

            // Doctor can no longer see patient in their list
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.false;
            const patientsAfter = await doctorContract.getAuthorizedPatients(doctor.address);
            expect(patientsAfter).to.not.include(patient.address);

            // But existing records still exist
            const records = await patientContract.getMedicalRecords(patient.address);
            expect(records.length).to.equal(1);
            expect(records[0].isActive).to.be.true;
        });
    });

    describe("Multi-Doctor Scenario", function () {
        it("should handle patient granting access to 3 doctors then revoking 1", async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            await doctorContract.registerDoctor(doctor2.address, "Dr. Lee", "Neurologist");
            await doctorContract.registerDoctor(doctor3.address, "Dr. Patel", "Surgeon");

            // Grant access to all 3
            await doctorContract.addPatientAccess(doctor.address, patient.address);
            await doctorContract.addPatientAccess(doctor2.address, patient.address);
            await doctorContract.addPatientAccess(doctor3.address, patient.address);

            // All 3 authorized
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.true;
            expect(await doctorContract.isAuthorized(doctor2.address, patient.address)).to.be.true;
            expect(await doctorContract.isAuthorized(doctor3.address, patient.address)).to.be.true;

            // Patient revokes doctor2 only
            await doctorContract.connect(patient).revokePatientAccess(doctor2.address, patient.address);

            // doctor2 revoked, others still have access
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.true;
            expect(await doctorContract.isAuthorized(doctor2.address, patient.address)).to.be.false;
            expect(await doctorContract.isAuthorized(doctor3.address, patient.address)).to.be.true;
        });
    });

    describe("Document Versioning Workflow", function () {
        it("should correctly version documents: v1 → v2 → only v2 active", async function () {
            await patientContract.registerPatient(patient.address, "Alice", "patient");

            // Add v1
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmHashV1", "application/pdf", "report.pdf",
                "Blood Test v1", "Initial results", ""
            );

            // Add v2 referencing v1
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmHashV2", "application/pdf", "report.pdf",
                "Blood Test v2", "Updated results", "QmHashV1"
            );

            // All records still exist
            const all = await patientContract.getMedicalRecords(patient.address);
            expect(all.length).to.equal(2);
            expect(all[0].isActive).to.be.false; // v1 deactivated
            expect(all[1].isActive).to.be.true;  // v2 active

            // Only active records
            const active = await patientContract.getActiveRecords(patient.address);
            expect(active.length).to.equal(1);
            expect(active[0].ipfsHash).to.equal("QmHashV2");
        });
    });

    describe("Cross-Contract: DoctorManagement ↔ HealthcareAudit", function () {
        it("should log full register → grant → revoke audit trail", async function () {
            // Register doctor
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            await auditContract.addAuditLog(admin.address, "DOCTOR_REGISTERED", doctor.address, "Admin registered Dr. Smith");

            // Register patient
            await patientContract.registerPatient(patient.address, "Alice", "patient");
            await auditContract.addAuditLog(admin.address, "PATIENT_REGISTERED", patient.address, "Admin registered Alice");

            // Grant access
            await doctorContract.addPatientAccess(doctor.address, patient.address);
            await auditContract.connect(patient).addAuditLog(
                patient.address, "ACCESS_GRANTED", doctor.address, "Patient granted Dr. Smith access"
            );

            // Revoke access
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);
            await auditContract.connect(patient).addAuditLog(
                patient.address, "ACCESS_REVOKED", doctor.address, "Patient revoked Dr. Smith's access"
            );

            // Verify complete audit trail
            const trail = await auditContract.getAuditTrail();
            expect(trail.length).to.equal(4);
            expect(trail[0].actionType).to.equal("DOCTOR_REGISTERED");
            expect(trail[1].actionType).to.equal("PATIENT_REGISTERED");
            expect(trail[2].actionType).to.equal("ACCESS_GRANTED");
            expect(trail[3].actionType).to.equal("ACCESS_REVOKED");
        });

        it("should allow querying audit trail by subject after mixed actions", async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            await patientContract.registerPatient(patient.address, "Alice", "patient");

            // Multiple actions involving doctor as subject
            await auditContract.addAuditLog(admin.address, "DOCTOR_REGISTERED", doctor.address, "Registered");
            await auditContract.connect(patient).addAuditLog(patient.address, "ACCESS_GRANTED", doctor.address, "Granted");
            await auditContract.connect(patient).addAuditLog(patient.address, "ACCESS_REVOKED", doctor.address, "Revoked");

            // Action involving patient as subject
            await auditContract.addAuditLog(admin.address, "PATIENT_REGISTERED", patient.address, "Registered");

            // Query by doctor as subject
            const doctorLogs = await auditContract.getAuditTrailBySubject(doctor.address);
            expect(doctorLogs.length).to.equal(3);

            // Query by patient as subject
            const patientLogs = await auditContract.getAuditTrailBySubject(patient.address);
            expect(patientLogs.length).to.equal(1);
        });
    });

    describe("Full E2E Chain", function () {
        it("should complete register → grant → record → audit → revoke → records survive", async function () {
            // Register both
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            await patientContract.registerPatient(patient.address, "Alice", "patient");

            // Grant access
            await doctorContract.addPatientAccess(doctor.address, patient.address);

            // Doctor adds record
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmFullE2EHash", "application/pdf", "full_test.pdf",
                "Complete Test", "Full E2E test record", ""
            );

            // Audit log
            await auditContract.connect(doctor).addAuditLog(
                doctor.address, "RECORD_ADDED", patient.address, "Dr. Smith added record"
            );

            // Revoke
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);
            await auditContract.connect(patient).addAuditLog(
                patient.address, "ACCESS_REVOKED", doctor.address, "Patient revoked access"
            );

            // Verify final state
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.false;

            const records = await patientContract.getMedicalRecords(patient.address);
            expect(records.length).to.equal(1);
            expect(records[0].isActive).to.be.true;

            const trail = await auditContract.getAuditTrail();
            expect(trail.length).to.equal(2);
        });
    });

    describe("Revoke All, Re-grant One", function () {
        it("should handle revoking all doctors then re-granting one", async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            await doctorContract.registerDoctor(doctor2.address, "Dr. Lee", "Neurologist");

            await doctorContract.addPatientAccess(doctor.address, patient.address);
            await doctorContract.addPatientAccess(doctor2.address, patient.address);

            // Revoke both
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);
            await doctorContract.connect(patient).revokePatientAccess(doctor2.address, patient.address);

            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.false;
            expect(await doctorContract.isAuthorized(doctor2.address, patient.address)).to.be.false;

            // Re-grant one
            await doctorContract.addPatientAccess(doctor.address, patient.address);
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.true;
            expect(await doctorContract.isAuthorized(doctor2.address, patient.address)).to.be.false;
        });
    });

    describe("Multiple Patients, Multiple Doctors", function () {
        it("should handle complex selective revocations", async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            await doctorContract.registerDoctor(doctor2.address, "Dr. Lee", "Neurologist");

            // Grant: doctor→patient, doctor→patient2, doctor2→patient
            await doctorContract.addPatientAccess(doctor.address, patient.address);
            await doctorContract.addPatientAccess(doctor.address, patient2.address);
            await doctorContract.addPatientAccess(doctor2.address, patient.address);

            // patient revokes doctor only (keeps doctor2)
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);

            // Verify selective state
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.false;
            expect(await doctorContract.isAuthorized(doctor.address, patient2.address)).to.be.true;
            expect(await doctorContract.isAuthorized(doctor2.address, patient.address)).to.be.true;

            // doctor's patient list should only have patient2
            const doctorPatients = await doctorContract.getAuthorizedPatients(doctor.address);
            expect(doctorPatients.length).to.equal(1);
            expect(doctorPatients[0]).to.equal(patient2.address);
        });
    });
});
