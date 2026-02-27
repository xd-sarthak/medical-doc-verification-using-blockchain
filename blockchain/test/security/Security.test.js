const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Security Tests", function () {
    let doctorContract, patientContract, auditContract;
    let admin, doctor, patient, stranger, attacker;

    beforeEach(async function () {
        [admin, doctor, patient, stranger, attacker] = await ethers.getSigners();

        const DoctorManagement = await ethers.getContractFactory("DoctorManagement");
        doctorContract = await DoctorManagement.deploy();

        const PatientManagement = await ethers.getContractFactory("PatientManagement");
        patientContract = await PatientManagement.deploy();

        const HealthcareAudit = await ethers.getContractFactory("HealthcareAudit");
        auditContract = await HealthcareAudit.deploy();
    });

    // =========================================================================
    // ACCESS CONTROL
    // =========================================================================

    describe("Admin Privilege Escalation", function () {
        it("should prevent non-admin from registering a doctor", async function () {
            await expect(
                doctorContract.connect(stranger).registerDoctor(doctor.address, "Fake", "Fake")
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("should prevent non-admin from registering a patient", async function () {
            await expect(
                patientContract.connect(stranger).registerPatient(patient.address, "Fake", "Fake")
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("should prevent doctor from registering other doctors", async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            await expect(
                doctorContract.connect(doctor).registerDoctor(stranger.address, "Fake", "Fake")
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("should prevent patient from calling admin functions", async function () {
            await patientContract.registerPatient(patient.address, "Alice", "patient");
            await expect(
                patientContract.connect(patient).registerPatient(stranger.address, "Fake", "Fake")
            ).to.be.revertedWith("Only admin can call this function");
        });
    });

    describe("Only Patient Can Revoke", function () {
        beforeEach(async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            await doctorContract.addPatientAccess(doctor.address, patient.address);
        });

        it("should prevent doctor from revoking their own patient's access", async function () {
            await expect(
                doctorContract.connect(doctor).revokePatientAccess(doctor.address, patient.address)
            ).to.be.revertedWith("Only patient can revoke access");
        });

        it("should prevent stranger from revoking access", async function () {
            await expect(
                doctorContract.connect(stranger).revokePatientAccess(doctor.address, patient.address)
            ).to.be.revertedWith("Only patient can revoke access");
        });

        it("should prevent admin from revoking on behalf of patient", async function () {
            await expect(
                doctorContract.connect(admin).revokePatientAccess(doctor.address, patient.address)
            ).to.be.revertedWith("Only patient can revoke access");
        });
    });

    // =========================================================================
    // INPUT VALIDATION
    // =========================================================================

    describe("Input Validation", function () {
        it("should handle empty string username and role", async function () {
            // These should succeed (the contracts don't validate empty strings)
            await doctorContract.registerDoctor(doctor.address, "", "");
            const [username, role] = await doctorContract.getDoctor(doctor.address);
            expect(username).to.equal("");
            expect(role).to.equal("");
        });

        it("should handle very long string input", async function () {
            const longString = "A".repeat(10000);
            await patientContract.registerPatient(patient.address, longString, "patient");
            const [username, role] = await patientContract.getPatient(patient.address);
            expect(username).to.equal(longString);
        });

        it("should handle special characters and unicode in strings", async function () {
            const specialName = "Dr. O'Brien-Müller 日本語 <script>alert('xss')</script> 🏥";
            await doctorContract.registerDoctor(doctor.address, specialName, "Specialist");
            const [username, role] = await doctorContract.getDoctor(doctor.address);
            expect(username).to.equal(specialName);
        });

        it("should handle SQL injection attempts in strings (no-op on blockchain)", async function () {
            const sqlInject = "'; DROP TABLE doctors; --";
            await doctorContract.registerDoctor(doctor.address, sqlInject, "role");
            const [username, role] = await doctorContract.getDoctor(doctor.address);
            expect(username).to.equal(sqlInject); // Stored as-is, no SQL on blockchain
        });
    });

    // =========================================================================
    // IMMUTABILITY
    // =========================================================================

    describe("Audit Log Immutability", function () {
        it("should not allow modifying existing audit logs (append-only)", async function () {
            await auditContract.addAuditLog(admin.address, "ACCESS_GRANTED", doctor.address, "Original log");

            // Add another log — the first one must remain unchanged
            await auditContract.addAuditLog(admin.address, "ACCESS_REVOKED", doctor.address, "Second log");

            const trail = await auditContract.getAuditTrail();
            expect(trail.length).to.equal(2);
            expect(trail[0].details).to.equal("Original log");     // Unchanged
            expect(trail[0].actionType).to.equal("ACCESS_GRANTED"); // Unchanged
            expect(trail[1].details).to.equal("Second log");
        });

        it("should preserve audit log timestamps", async function () {
            await auditContract.addAuditLog(admin.address, "ACCESS_GRANTED", doctor.address, "Test");
            const trail1 = await auditContract.getAuditTrail();
            const timestamp1 = trail1[0].timestamp;

            // Add another log later
            await auditContract.addAuditLog(admin.address, "ACCESS_REVOKED", doctor.address, "Test2");
            const trail2 = await auditContract.getAuditTrail();

            // First log's timestamp hasn't changed
            expect(trail2[0].timestamp).to.equal(timestamp1);
        });
    });

    describe("IPFS Hash Immutability", function () {
        it("should preserve original record's IPFS hash after adding new records", async function () {
            await patientContract.registerPatient(patient.address, "Alice", "patient");

            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmOriginalHash", "application/pdf", "report.pdf",
                "Original", "Test", ""
            );

            // Add more records
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmSecondHash", "application/pdf", "report2.pdf",
                "Second", "Test", ""
            );

            const records = await patientContract.getMedicalRecords(patient.address);
            expect(records[0].ipfsHash).to.equal("QmOriginalHash"); // Unchanged
            expect(records[1].ipfsHash).to.equal("QmSecondHash");
        });
    });

    // =========================================================================
    // REENTRANCY
    // =========================================================================

    describe("Reentrancy Attack Prevention", function () {
        it("should resist reentrancy on revokePatientAccess", async function () {
            // Deploy attacker contract
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");

            const ReentrancyAttacker = await ethers.getContractFactory("ReentrancyAttacker");
            const attackerContract = await ReentrancyAttacker.deploy(await doctorContract.getAddress());

            // Grant access to the attacker contract as a patient
            await doctorContract.addPatientAccess(doctor.address, await attackerContract.getAddress());

            // Set params for attack
            await attackerContract.setParams(doctor.address, await attackerContract.getAddress());

            // The attack calls revokePatientAccess, and the fallback tries to re-enter.
            // Since revokePatientAccess sets the mapping to false BEFORE the loop,
            // the re-entrant call should fail with "Access not granted".
            await attackerContract.attack();

            // Verify access is properly revoked
            expect(
                await doctorContract.isAuthorized(doctor.address, await attackerContract.getAddress())
            ).to.be.false;
        });
    });

    // =========================================================================
    // ZERO ADDRESS / EDGE CASES
    // =========================================================================

    describe("Zero Address Handling", function () {
        it("should allow registering zero address as doctor (no guard in contract)", async function () {
            // The contract doesn't explicitly check for zero address
            // This test documents the behavior
            await doctorContract.registerDoctor(ethers.ZeroAddress, "Zero", "None");
            const [username, role] = await doctorContract.getDoctor(ethers.ZeroAddress);
            expect(username).to.equal("Zero");
        });

        it("should allow registering zero address as patient", async function () {
            await patientContract.registerPatient(ethers.ZeroAddress, "Zero", "None");
            const [username, role] = await patientContract.getPatient(ethers.ZeroAddress);
            expect(username).to.equal("Zero");
        });
    });

    describe("Cross-Role Registration", function () {
        it("should allow same address to be registered as both doctor and patient", async function () {
            // These are separate contracts, so the same address can exist in both
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            await patientContract.registerPatient(doctor.address, "Dr. Smith", "patient");

            const [docName] = await doctorContract.getDoctor(doctor.address);
            const [patName] = await patientContract.getPatient(doctor.address);
            expect(docName).to.equal("Dr. Smith");
            expect(patName).to.equal("Dr. Smith");
        });
    });

    // =========================================================================
    // GAS GRIEFING / DoS RESISTANCE
    // =========================================================================

    describe("DoS Resistance", function () {
        it("should handle rapid successive grant/revoke operations", async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");

            // Rapid grant → revoke × 5 cycles
            for (let i = 0; i < 5; i++) {
                await doctorContract.addPatientAccess(doctor.address, patient.address);
                await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);
            }

            // Final state should be revoked
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.false;
            const patients = await doctorContract.getAuthorizedPatients(doctor.address);
            expect(patients.length).to.equal(0);
        });

        it("should handle many audit log entries without failure", async function () {
            // Add 20 audit logs rapidly
            for (let i = 0; i < 20; i++) {
                await auditContract.addAuditLog(
                    admin.address, "RECORD_ADDED", patient.address, `Log entry ${i}`
                );
            }

            const trail = await auditContract.getAuditTrail();
            expect(trail.length).to.equal(20);
        });
    });
});
