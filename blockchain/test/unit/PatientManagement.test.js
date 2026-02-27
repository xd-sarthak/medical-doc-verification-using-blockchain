const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PatientManagement", function () {
    let patientContract;
    let admin, doctor, patient, stranger;

    beforeEach(async function () {
        [admin, doctor, patient, stranger] = await ethers.getSigners();
        const PatientManagement = await ethers.getContractFactory("PatientManagement");
        patientContract = await PatientManagement.deploy();
    });

    // =========================================================================
    // DEPLOYMENT
    // =========================================================================

    describe("Deployment", function () {
        it("should set deployer as admin", async function () {
            expect(await patientContract.admin()).to.equal(admin.address);
        });

        it("should register admin as a patient on deploy", async function () {
            const [username, role] = await patientContract.getPatient(admin.address);
            expect(username).to.equal("admin");
            expect(role).to.equal("admin");
        });
    });

    // =========================================================================
    // registerPatient
    // =========================================================================

    describe("registerPatient", function () {
        it("should register a patient successfully", async function () {
            await patientContract.registerPatient(patient.address, "Alice", "patient");
            const [username, role] = await patientContract.getPatient(patient.address);
            expect(username).to.equal("Alice");
            expect(role).to.equal("patient");
        });

        it("should emit PatientRegistered event with correct args", async function () {
            await expect(patientContract.registerPatient(patient.address, "Alice", "patient"))
                .to.emit(patientContract, "PatientRegistered")
                .withArgs(patient.address, "Alice", "patient");
        });

        it("should revert if non-admin tries to register", async function () {
            await expect(
                patientContract.connect(stranger).registerPatient(patient.address, "Alice", "patient")
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("should revert if patient is already registered", async function () {
            await patientContract.registerPatient(patient.address, "Alice", "patient");
            await expect(
                patientContract.registerPatient(patient.address, "Alice2", "patient")
            ).to.be.revertedWith("Patient already registered");
        });

        it("should allow registering with empty username (edge case)", async function () {
            await patientContract.registerPatient(patient.address, "", "patient");
            const [username, role] = await patientContract.getPatient(patient.address);
            expect(username).to.equal("");
            expect(role).to.equal("patient");
        });
    });

    // =========================================================================
    // getPatient
    // =========================================================================

    describe("getPatient", function () {
        it("should return correct patient data", async function () {
            await patientContract.registerPatient(patient.address, "Bob", "outpatient");
            const [username, role] = await patientContract.getPatient(patient.address);
            expect(username).to.equal("Bob");
            expect(role).to.equal("outpatient");
        });

        it("should revert for unregistered patient", async function () {
            await expect(
                patientContract.getPatient(stranger.address)
            ).to.be.revertedWith("Patient not registered");
        });
    });

    // =========================================================================
    // addMedicalRecord
    // =========================================================================

    describe("addMedicalRecord", function () {
        beforeEach(async function () {
            await patientContract.registerPatient(patient.address, "Alice", "patient");
        });

        it("should add a medical record successfully", async function () {
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmHash1", "application/pdf", "report.pdf", "Blood Test", "Annual checkup", ""
            );
            const records = await patientContract.getMedicalRecords(patient.address);
            expect(records.length).to.equal(1);
            expect(records[0].ipfsHash).to.equal("QmHash1");
        });

        it("should emit MedicalRecordAdded event", async function () {
            await expect(
                patientContract.connect(doctor).addMedicalRecord(
                    patient.address, "QmHash1", "application/pdf", "report.pdf", "Blood Test", "Summary", ""
                )
            ).to.emit(patientContract, "MedicalRecordAdded");
        });

        it("should store msg.sender as the doctor field", async function () {
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmHash1", "application/pdf", "report.pdf", "Test", "Summary", ""
            );
            const records = await patientContract.getMedicalRecords(patient.address);
            expect(records[0].doctor).to.equal(doctor.address);
        });

        it("should revert for unregistered patient", async function () {
            await expect(
                patientContract.connect(doctor).addMedicalRecord(
                    stranger.address, "QmHash1", "application/pdf", "report.pdf", "Test", "Summary", ""
                )
            ).to.be.revertedWith("Patient not registered");
        });

        it("should allow record with empty string fields (edge case)", async function () {
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "", "", "", "", "", ""
            );
            const records = await patientContract.getMedicalRecords(patient.address);
            expect(records.length).to.equal(1);
            expect(records[0].ipfsHash).to.equal("");
        });

        it("should add multiple records for the same patient", async function () {
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmHash1", "application/pdf", "r1.pdf", "Test 1", "S1", ""
            );
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmHash2", "image/png", "xray.png", "X-Ray", "S2", ""
            );
            const records = await patientContract.getMedicalRecords(patient.address);
            expect(records.length).to.equal(2);
        });
    });

    // =========================================================================
    // DOCUMENT VERSIONING
    // =========================================================================

    describe("Document Versioning", function () {
        beforeEach(async function () {
            await patientContract.registerPatient(patient.address, "Alice", "patient");
        });

        it("should deactivate old record when updating with previousVersion", async function () {
            // Add v1
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmHashV1", "application/pdf", "report.pdf", "Blood Test v1", "Initial", ""
            );

            // Add v2 referencing v1
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmHashV2", "application/pdf", "report.pdf", "Blood Test v2", "Updated", "QmHashV1"
            );

            const allRecords = await patientContract.getMedicalRecords(patient.address);
            expect(allRecords[0].isActive).to.be.false; // v1 deactivated
            expect(allRecords[1].isActive).to.be.true;  // v2 active
        });

        it("should emit MedicalRecordUpdated event on version update", async function () {
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmHashV1", "application/pdf", "report.pdf", "Test v1", "Initial", ""
            );

            await expect(
                patientContract.connect(doctor).addMedicalRecord(
                    patient.address, "QmHashV2", "application/pdf", "report.pdf", "Test v2", "Updated", "QmHashV1"
                )
            ).to.emit(patientContract, "MedicalRecordUpdated");
        });

        it("getActiveRecords should only return active records after versioning", async function () {
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmHashV1", "application/pdf", "r.pdf", "V1", "S", ""
            );
            await patientContract.connect(doctor).addMedicalRecord(
                patient.address, "QmHashV2", "application/pdf", "r.pdf", "V2", "S", "QmHashV1"
            );

            const active = await patientContract.getActiveRecords(patient.address);
            expect(active.length).to.equal(1);
            expect(active[0].ipfsHash).to.equal("QmHashV2");
        });
    });

    // =========================================================================
    // getMedicalRecords & getActiveRecords
    // =========================================================================

    describe("getMedicalRecords & getActiveRecords", function () {
        it("should revert getMedicalRecords for unregistered patient", async function () {
            await expect(
                patientContract.getMedicalRecords(stranger.address)
            ).to.be.revertedWith("Patient not registered");
        });

        it("should revert getActiveRecords for unregistered patient", async function () {
            await expect(
                patientContract.getActiveRecords(stranger.address)
            ).to.be.revertedWith("Patient not registered");
        });

        it("should return empty array when patient has no records", async function () {
            await patientContract.registerPatient(patient.address, "Alice", "patient");
            const records = await patientContract.getMedicalRecords(patient.address);
            expect(records.length).to.equal(0);
        });
    });
});
