const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DoctorManagement", function () {
    let doctorContract;
    let admin, doctor, doctor2, patient, patient2, patient3, stranger;

    beforeEach(async function () {
        [admin, doctor, doctor2, patient, patient2, patient3, stranger] = await ethers.getSigners();
        const DoctorManagement = await ethers.getContractFactory("DoctorManagement");
        doctorContract = await DoctorManagement.deploy();
    });

    // =========================================================================
    // DEPLOYMENT
    // =========================================================================

    describe("Deployment", function () {
        it("should set deployer as admin", async function () {
            expect(await doctorContract.admin()).to.equal(admin.address);
        });

        it("should register admin as a doctor on deploy", async function () {
            const [username, role] = await doctorContract.getDoctor(admin.address);
            expect(username).to.equal("admin");
            expect(role).to.equal("admin");
        });

        it("should include admin in getAllDoctors", async function () {
            const doctors = await doctorContract.getAllDoctors();
            expect(doctors).to.include(admin.address);
        });
    });

    // =========================================================================
    // registerDoctor
    // =========================================================================

    describe("registerDoctor", function () {
        it("should register a doctor successfully", async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            const [username, role] = await doctorContract.getDoctor(doctor.address);
            expect(username).to.equal("Dr. Smith");
            expect(role).to.equal("Cardiologist");
        });

        it("should emit DoctorRegistered event with correct args", async function () {
            await expect(
                doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist")
            )
                .to.emit(doctorContract, "DoctorRegistered")
                .withArgs(doctor.address, "Dr. Smith", "Cardiologist");
        });

        it("should add doctor to getAllDoctors list", async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            const doctors = await doctorContract.getAllDoctors();
            expect(doctors).to.include(doctor.address);
            expect(doctors.length).to.equal(2); // admin + doctor
        });

        it("should revert if non-admin tries to register", async function () {
            await expect(
                doctorContract.connect(stranger).registerDoctor(doctor.address, "Dr. Smith", "Cardiologist")
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("should revert if doctor already registered", async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            await expect(
                doctorContract.registerDoctor(doctor.address, "Dr. Smith 2", "Surgeon")
            ).to.be.revertedWith("Doctor already registered");
        });

        it("should allow registering with empty username (edge case)", async function () {
            await doctorContract.registerDoctor(doctor.address, "", "");
            const [username, role] = await doctorContract.getDoctor(doctor.address);
            expect(username).to.equal("");
            expect(role).to.equal("");
        });
    });

    // =========================================================================
    // getDoctor
    // =========================================================================

    describe("getDoctor", function () {
        it("should return correct doctor data", async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Lee", "Neurologist");
            const [username, role] = await doctorContract.getDoctor(doctor.address);
            expect(username).to.equal("Dr. Lee");
            expect(role).to.equal("Neurologist");
        });

        it("should revert for unregistered doctor", async function () {
            await expect(
                doctorContract.getDoctor(stranger.address)
            ).to.be.revertedWith("Doctor not registered");
        });
    });

    // =========================================================================
    // addPatientAccess
    // =========================================================================

    describe("addPatientAccess", function () {
        beforeEach(async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
        });

        it("should grant patient access successfully", async function () {
            await doctorContract.addPatientAccess(doctor.address, patient.address);
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.true;
        });

        it("should add patient to getAuthorizedPatients list", async function () {
            await doctorContract.addPatientAccess(doctor.address, patient.address);
            const patients = await doctorContract.getAuthorizedPatients(doctor.address);
            expect(patients).to.include(patient.address);
        });

        it("should emit PatientAccessGranted event", async function () {
            await expect(doctorContract.addPatientAccess(doctor.address, patient.address))
                .to.emit(doctorContract, "PatientAccessGranted")
                .withArgs(doctor.address, patient.address);
        });

        it("should revert for unregistered doctor", async function () {
            await expect(
                doctorContract.addPatientAccess(stranger.address, patient.address)
            ).to.be.revertedWith("Doctor not registered");
        });

        it("should revert if access already granted (duplicate)", async function () {
            await doctorContract.addPatientAccess(doctor.address, patient.address);
            await expect(
                doctorContract.addPatientAccess(doctor.address, patient.address)
            ).to.be.revertedWith("Access already granted");
        });
    });

    // =========================================================================
    // revokePatientAccess
    // =========================================================================

    describe("revokePatientAccess", function () {
        beforeEach(async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            await doctorContract.addPatientAccess(doctor.address, patient.address);
        });

        it("should revoke access when called by patient", async function () {
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.false;
        });

        it("should remove patient from authorized patients list", async function () {
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);
            const patients = await doctorContract.getAuthorizedPatients(doctor.address);
            expect(patients).to.not.include(patient.address);
        });

        it("should emit PatientAccessRevoked event", async function () {
            await expect(
                doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address)
            )
                .to.emit(doctorContract, "PatientAccessRevoked")
                .withArgs(doctor.address, patient.address);
        });

        it("should revert if non-patient tries to revoke", async function () {
            await expect(
                doctorContract.connect(doctor).revokePatientAccess(doctor.address, patient.address)
            ).to.be.revertedWith("Only patient can revoke access");
        });

        it("should revert if admin tries to revoke", async function () {
            await expect(
                doctorContract.connect(admin).revokePatientAccess(doctor.address, patient.address)
            ).to.be.revertedWith("Only patient can revoke access");
        });

        it("should revert on double-revoke", async function () {
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);
            await expect(
                doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address)
            ).to.be.revertedWith("Access not granted");
        });

        it("should revert for unregistered doctor", async function () {
            await expect(
                doctorContract.connect(patient).revokePatientAccess(stranger.address, patient.address)
            ).to.be.revertedWith("Doctor not registered");
        });
    });

    // =========================================================================
    // GRANT → REVOKE → RE-GRANT CYCLE
    // =========================================================================

    describe("Grant → Revoke → Re-grant Cycle", function () {
        beforeEach(async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
        });

        it("should allow re-granting after revocation", async function () {
            await doctorContract.addPatientAccess(doctor.address, patient.address);
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.false;

            await doctorContract.addPatientAccess(doctor.address, patient.address);
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.true;
        });

        it("should allow a second revoke after re-grant", async function () {
            await doctorContract.addPatientAccess(doctor.address, patient.address);
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);
            await doctorContract.addPatientAccess(doctor.address, patient.address);
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.false;
        });
    });

    // =========================================================================
    // MULTI-PATIENT SCENARIOS
    // =========================================================================

    describe("Multi-Patient Scenarios", function () {
        beforeEach(async function () {
            await doctorContract.registerDoctor(doctor.address, "Dr. Smith", "Cardiologist");
            await doctorContract.addPatientAccess(doctor.address, patient.address);
            await doctorContract.addPatientAccess(doctor.address, patient2.address);
        });

        it("should only revoke the specific patient, not others", async function () {
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);
            expect(await doctorContract.isAuthorized(doctor.address, patient.address)).to.be.false;
            expect(await doctorContract.isAuthorized(doctor.address, patient2.address)).to.be.true;
        });

        it("should maintain correct patients array after partial revoke", async function () {
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);
            const patients = await doctorContract.getAuthorizedPatients(doctor.address);
            expect(patients.length).to.equal(1);
            expect(patients[0]).to.equal(patient2.address);
        });

        it("should handle revoking all patients from a doctor", async function () {
            await doctorContract.connect(patient).revokePatientAccess(doctor.address, patient.address);
            await doctorContract.connect(patient2).revokePatientAccess(doctor.address, patient2.address);
            const patients = await doctorContract.getAuthorizedPatients(doctor.address);
            expect(patients.length).to.equal(0);
        });
    });
});
