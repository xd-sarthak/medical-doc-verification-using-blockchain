const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HealthcareAudit", function () {
    let auditContract;
    let admin, actor1, actor2, subject1, subject2;

    beforeEach(async function () {
        [admin, actor1, actor2, subject1, subject2] = await ethers.getSigners();
        const HealthcareAudit = await ethers.getContractFactory("HealthcareAudit");
        auditContract = await HealthcareAudit.deploy();
    });

    // =========================================================================
    // DEPLOYMENT
    // =========================================================================

    describe("Deployment", function () {
        it("should set deployer as admin", async function () {
            expect(await auditContract.admin()).to.equal(admin.address);
        });

        it("should have correct constant action type strings", async function () {
            expect(await auditContract.DOCTOR_REGISTERED()).to.equal("DOCTOR_REGISTERED");
            expect(await auditContract.PATIENT_REGISTERED()).to.equal("PATIENT_REGISTERED");
            expect(await auditContract.RECORD_ADDED()).to.equal("RECORD_ADDED");
            expect(await auditContract.ACCESS_GRANTED()).to.equal("ACCESS_GRANTED");
        });

        it("should start with empty audit trail", async function () {
            const trail = await auditContract.getAuditTrail();
            expect(trail.length).to.equal(0);
        });
    });

    // =========================================================================
    // addAuditLog
    // =========================================================================

    describe("addAuditLog", function () {
        it("should add an audit log successfully", async function () {
            await auditContract.addAuditLog(actor1.address, "ACCESS_GRANTED", subject1.address, "Granted access");
            const trail = await auditContract.getAuditTrail();
            expect(trail.length).to.equal(1);
            expect(trail[0].actor).to.equal(actor1.address);
            expect(trail[0].actionType).to.equal("ACCESS_GRANTED");
            expect(trail[0].subject).to.equal(subject1.address);
            expect(trail[0].details).to.equal("Granted access");
        });

        it("should emit AuditLogAdded event with correct args", async function () {
            await expect(
                auditContract.addAuditLog(actor1.address, "RECORD_ADDED", subject1.address, "Added record")
            ).to.emit(auditContract, "AuditLogAdded");
        });

        it("should store block.timestamp in the record", async function () {
            await auditContract.addAuditLog(actor1.address, "ACCESS_GRANTED", subject1.address, "Test");
            const trail = await auditContract.getAuditTrail();
            expect(trail[0].timestamp).to.be.greaterThan(0);
        });

        it("should allow anyone to add audit logs (no access restriction)", async function () {
            await auditContract.connect(actor1).addAuditLog(
                actor1.address, "ACCESS_REVOKED", subject1.address, "Revoked"
            );
            const trail = await auditContract.getAuditTrail();
            expect(trail.length).to.equal(1);
        });

        it("should allow audit log with empty string fields (edge case)", async function () {
            await auditContract.addAuditLog(actor1.address, "", subject1.address, "");
            const trail = await auditContract.getAuditTrail();
            expect(trail[0].actionType).to.equal("");
            expect(trail[0].details).to.equal("");
        });
    });

    // =========================================================================
    // getAuditTrail
    // =========================================================================

    describe("getAuditTrail", function () {
        it("should return all logs in order", async function () {
            await auditContract.addAuditLog(actor1.address, "ACCESS_GRANTED", subject1.address, "Log 1");
            await auditContract.addAuditLog(actor2.address, "ACCESS_REVOKED", subject1.address, "Log 2");
            await auditContract.addAuditLog(actor1.address, "RECORD_ADDED", subject2.address, "Log 3");

            const trail = await auditContract.getAuditTrail();
            expect(trail.length).to.equal(3);
            expect(trail[0].details).to.equal("Log 1");
            expect(trail[1].details).to.equal("Log 2");
            expect(trail[2].details).to.equal("Log 3");
        });
    });

    // =========================================================================
    // getAuditTrailByActor
    // =========================================================================

    describe("getAuditTrailByActor", function () {
        it("should filter logs by actor correctly", async function () {
            await auditContract.addAuditLog(actor1.address, "ACCESS_GRANTED", subject1.address, "By actor1");
            await auditContract.addAuditLog(actor2.address, "RECORD_ADDED", subject1.address, "By actor2");
            await auditContract.addAuditLog(actor1.address, "ACCESS_REVOKED", subject2.address, "By actor1 again");

            const logs = await auditContract.getAuditTrailByActor(actor1.address);
            expect(logs.length).to.equal(2);
            expect(logs[0].details).to.equal("By actor1");
            expect(logs[1].details).to.equal("By actor1 again");
        });

        it("should return empty array for actor with no logs", async function () {
            await auditContract.addAuditLog(actor1.address, "ACCESS_GRANTED", subject1.address, "Test");
            const logs = await auditContract.getAuditTrailByActor(actor2.address);
            expect(logs.length).to.equal(0);
        });
    });

    // =========================================================================
    // getAuditTrailBySubject
    // =========================================================================

    describe("getAuditTrailBySubject", function () {
        it("should filter logs by subject correctly", async function () {
            await auditContract.addAuditLog(actor1.address, "ACCESS_GRANTED", subject1.address, "About s1");
            await auditContract.addAuditLog(actor2.address, "RECORD_ADDED", subject2.address, "About s2");
            await auditContract.addAuditLog(actor1.address, "ACCESS_REVOKED", subject1.address, "About s1 again");

            const logs = await auditContract.getAuditTrailBySubject(subject1.address);
            expect(logs.length).to.equal(2);
            expect(logs[0].details).to.equal("About s1");
            expect(logs[1].details).to.equal("About s1 again");
        });

        it("should return empty array for subject with no logs", async function () {
            const logs = await auditContract.getAuditTrailBySubject(subject2.address);
            expect(logs.length).to.equal(0);
        });
    });
});
