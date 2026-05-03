const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Optimized Workflow", function () {
    let registry, consentLedger, recordRegistry;
    let admin, doctor, patient, stranger;

    const UPLOAD_SCOPE = 2;
    const FULL_ACCESS_SCOPE = 3;

    function findEvent(receipt, name) {
        const parsed = receipt.logs
            .map((log) => {
                try {
                    return recordRegistry.interface.parseLog(log);
                } catch (error) {
                    return null;
                }
            })
            .find((log) => log && log.name === name);

        expect(parsed, `missing ${name} event`).to.not.equal(undefined);
        return parsed;
    }

    beforeEach(async function () {
        [admin, doctor, patient, stranger] = await ethers.getSigners();

        const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
        registry = await upgrades.deployProxy(IdentityRegistry, [], { kind: "uups" });
        await registry.waitForDeployment();

        await registry.registerIdentity(doctor.address, 2);
        await registry.registerIdentity(patient.address, 3);

        const ConsentLedger = await ethers.getContractFactory("ConsentLedger");
        consentLedger = await upgrades.deployProxy(
            ConsentLedger,
            [await registry.getAddress()],
            { kind: "uups" }
        );
        await consentLedger.waitForDeployment();

        const RecordRegistry = await ethers.getContractFactory("RecordRegistry");
        recordRegistry = await upgrades.deployProxy(
            RecordRegistry,
            [await registry.getAddress(), await consentLedger.getAddress()],
            { kind: "uups" }
        );
        await recordRegistry.waitForDeployment();
    });

    it("requires patient consent before doctor record creation", async function () {
        const documentHash = ethers.id("record-v1");
        const metadataHash = ethers.id("metadata-v1");

        await expect(
            recordRegistry.connect(doctor).createRecord(patient.address, documentHash, metadataHash)
        ).to.be.revertedWithCustomError(recordRegistry, "ConsentRequired");

        const latestBlock = await ethers.provider.getBlock("latest");
        await consentLedger.connect(patient).grantConsent(
            doctor.address,
            UPLOAD_SCOPE,
            latestBlock.timestamp + 3600
        );

        await expect(
            recordRegistry.connect(doctor).createRecord(patient.address, documentHash, metadataHash)
        ).to.emit(recordRegistry, "RecordCreated");
    });

    it("supports record versioning with provenance links", async function () {
        const latestBlock = await ethers.provider.getBlock("latest");
        await consentLedger.connect(patient).grantConsent(
            doctor.address,
            FULL_ACCESS_SCOPE,
            latestBlock.timestamp + 3600
        );

        const tx = await recordRegistry.connect(doctor).createRecord(
            patient.address,
            ethers.id("record-v1"),
            ethers.id("metadata-v1")
        );
        const receipt = await tx.wait();
        const parsedCreated = findEvent(receipt, "RecordCreated");
        const originalRecordId = parsedCreated.args.recordId;
        const rootId = parsedCreated.args.rootId;

        const versionTx = await recordRegistry.connect(doctor).updateRecord(
            originalRecordId,
            ethers.id("record-v2"),
            ethers.id("metadata-v2")
        );
        const versionReceipt = await versionTx.wait();
        const parsedVersioned = findEvent(versionReceipt, "RecordVersioned");
        const newRecordId = parsedVersioned.args.newRecordId;

        const oldRecord = await recordRegistry.getRecord(originalRecordId);
        const newRecord = await recordRegistry.getRecord(newRecordId);
        expect(oldRecord.status).to.equal(2);
        expect(newRecord.parentId).to.equal(originalRecordId);
        expect(newRecord.rootId).to.equal(rootId);
        expect(newRecord.doctor).to.equal(doctor.address);
        expect(newRecordId).to.not.equal(originalRecordId);
    });

    it("allows patient to revoke consent and blocks later writes", async function () {
        const latestBlock = await ethers.provider.getBlock("latest");
        await consentLedger.connect(patient).grantConsent(
            doctor.address,
            UPLOAD_SCOPE,
            latestBlock.timestamp + 3600
        );

        await consentLedger.connect(patient).revokeConsent(doctor.address, ethers.id("patient-withdrawn"));

        await expect(
            recordRegistry.connect(doctor).createRecord(
                patient.address,
                ethers.id("record-after-revoke"),
                ethers.id("metadata-after-revoke")
            )
        ).to.be.revertedWithCustomError(recordRegistry, "ConsentRequired");
    });

    it("blocks unregistered actors from using optimized workflows", async function () {
        const latestBlock = await ethers.provider.getBlock("latest");
        await consentLedger.connect(patient).grantConsent(
            doctor.address,
            UPLOAD_SCOPE,
            latestBlock.timestamp + 3600
        );

        await expect(
            recordRegistry.connect(stranger).createRecord(
                patient.address,
                ethers.id("record-invalid"),
                ethers.id("metadata-invalid")
            )
        ).to.be.revertedWithCustomError(recordRegistry, "InvalidDoctor");
    });

    it("prevents a different doctor from superseding another doctor's record", async function () {
        const [, , , , doctorTwo] = await ethers.getSigners();
        await registry.registerIdentity(doctorTwo.address, 2);

        const latestBlock = await ethers.provider.getBlock("latest");
        await consentLedger.connect(patient).grantConsent(
            doctor.address,
            UPLOAD_SCOPE,
            latestBlock.timestamp + 3600
        );
        await consentLedger.connect(patient).grantConsent(
            doctorTwo.address,
            UPLOAD_SCOPE,
            latestBlock.timestamp + 3600
        );

        const tx = await recordRegistry.connect(doctor).createRecord(
            patient.address,
            ethers.id("record-v1"),
            ethers.id("metadata-v1")
        );
        const receipt = await tx.wait();
        const parsedCreated = findEvent(receipt, "RecordCreated");

        await expect(
            recordRegistry.connect(doctorTwo).updateRecord(
                parsedCreated.args.recordId,
                ethers.id("record-v2"),
                ethers.id("metadata-v2")
            )
        ).to.be.revertedWithCustomError(recordRegistry, "RecordAuthorMismatch");
    });

    it("lets anyone inspect active consent without mutating storage and expire it separately", async function () {
        const latestBlock = await ethers.provider.getBlock("latest");
        const expiry = latestBlock.timestamp + 10;

        await consentLedger.connect(patient).grantConsent(
            doctor.address,
            UPLOAD_SCOPE,
            expiry
        );

        expect(
            await consentLedger.hasValidConsent(patient.address, doctor.address, UPLOAD_SCOPE)
        ).to.equal(true);

        await ethers.provider.send("evm_setNextBlockTimestamp", [expiry + 1]);
        await ethers.provider.send("evm_mine");

        expect(
            await consentLedger.hasValidConsent(patient.address, doctor.address, UPLOAD_SCOPE)
        ).to.equal(false);

        await expect(
            consentLedger.connect(stranger).expireConsent(patient.address, doctor.address)
        ).to.emit(consentLedger, "ConsentExpired");

        const consent = await consentLedger.getActiveConsent(patient.address, doctor.address);
        expect(consent.nonce).to.equal(0);
    });
});
