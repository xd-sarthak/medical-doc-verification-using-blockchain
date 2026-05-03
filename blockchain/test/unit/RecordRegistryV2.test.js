const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RecordRegistryV2", function () {
    let registry, consent, records;
    let admin, doctor, doctor2, patient, patient2, stranger;

    const SCOPE_UPLOAD = 2;

    const DOC_HASH  = ethers.id("document-content-v1");
    const META_HASH = ethers.id("metadata-content-v1");
    const DOC_HASH2 = ethers.id("document-content-v2");
    const META_HASH2 = ethers.id("metadata-content-v2");

    beforeEach(async function () {
        [admin, doctor, doctor2, patient, patient2, stranger] = await ethers.getSigners();

        // Deploy V2 stack
        const RegistryFactory = await ethers.getContractFactory("IdentityRegistryV2");
        registry = await RegistryFactory.deploy();
        await registry.waitForDeployment();

        const ConsentFactory = await ethers.getContractFactory("ConsentLedgerV2");
        consent = await ConsentFactory.deploy(await registry.getAddress());
        await consent.waitForDeployment();

        const RecordFactory = await ethers.getContractFactory("RecordRegistryV2");
        records = await RecordFactory.deploy(await registry.getAddress(), await consent.getAddress());
        await records.waitForDeployment();

        // Register identities
        await registry.registerIdentity(doctor.address, 2);    // Doctor
        await registry.registerIdentity(doctor2.address, 2);   // Doctor
        await registry.registerIdentity(patient.address, 3);   // Patient
        await registry.registerIdentity(patient2.address, 3);  // Patient

        // Grant consent: patient → doctor (SCOPE_UPLOAD)
        const expiry = (await time.latest()) + 86400;
        await consent.connect(patient).grantConsent(doctor.address, SCOPE_UPLOAD, expiry);
    });

    // ═══════════════════════════════════════════════════════
    // CREATE RECORD
    // ═══════════════════════════════════════════════════════

    describe("createRecord", function () {
        it("creates a record and returns recordId=1", async function () {
            const tx = await records.connect(doctor).createRecord(patient.address, DOC_HASH, META_HASH);
            const receipt = await tx.wait();

            const record = await records.getRecord(1);
            expect(record.documentHash).to.equal(DOC_HASH);
            expect(record.metadataHash).to.equal(META_HASH);
            expect(record.patient).to.equal(patient.address);
            expect(record.doctor).to.equal(doctor.address);
            expect(record.parentId).to.equal(0);
            expect(record.rootId).to.equal(1);
            expect(record.recordId).to.equal(1);
            expect(record.status).to.equal(1); // Active
        });

        it("sets head pointer correctly", async function () {
            await records.connect(doctor).createRecord(patient.address, DOC_HASH, META_HASH);
            expect(await records.getActiveRecordId(1)).to.equal(1);
            expect(await records.isActiveRecord(1)).to.equal(true);
        });

        it("increments nextRecordId", async function () {
            await records.connect(doctor).createRecord(patient.address, DOC_HASH, META_HASH);
            expect(await records.nextRecordId()).to.equal(2);
        });

        it("emits RecordCreated", async function () {
            await expect(records.connect(doctor).createRecord(patient.address, DOC_HASH, META_HASH))
                .to.emit(records, "RecordCreated")
                .withArgs(1, 1, patient.address, doctor.address, DOC_HASH, META_HASH, () => true);
        });

        it("reverts if patient is not registered", async function () {
            await expect(
                records.connect(doctor).createRecord(stranger.address, DOC_HASH, META_HASH)
            ).to.be.revertedWithCustomError(records, "InvalidPatient");
        });

        it("reverts if caller is not a doctor", async function () {
            await expect(
                records.connect(patient).createRecord(patient.address, DOC_HASH, META_HASH)
            ).to.be.revertedWithCustomError(records, "InvalidDoctor");
        });

        it("reverts for zero document hash", async function () {
            await expect(
                records.connect(doctor).createRecord(patient.address, ethers.ZeroHash, META_HASH)
            ).to.be.revertedWithCustomError(records, "InvalidDocumentHash");
        });

        it("reverts for zero metadata hash", async function () {
            await expect(
                records.connect(doctor).createRecord(patient.address, DOC_HASH, ethers.ZeroHash)
            ).to.be.revertedWithCustomError(records, "InvalidMetadataHash");
        });

        it("reverts without consent", async function () {
            await expect(
                records.connect(doctor).createRecord(patient2.address, DOC_HASH, META_HASH)
            ).to.be.revertedWithCustomError(records, "ConsentRequired");
        });

        // ── GAS SNAPSHOT ──
        it("uses ≤ 160,000 gas (pre-optimizer; Phase 4 target: ≤ 110,000)", async function () {
            const tx = await records.connect(doctor).createRecord(patient.address, DOC_HASH, META_HASH);
            const receipt = await tx.wait();
            console.log(`    ⛽ createRecord gas: ${receipt.gasUsed}`);
            expect(receipt.gasUsed).to.be.lessThanOrEqual(160000);
        });
    });

    // ═══════════════════════════════════════════════════════
    // UPDATE RECORD (VERSIONING)
    // ═══════════════════════════════════════════════════════

    describe("updateRecord", function () {
        beforeEach(async function () {
            await records.connect(doctor).createRecord(patient.address, DOC_HASH, META_HASH);
        });

        it("creates a new version and supersedes the old", async function () {
            const tx = await records.connect(doctor).updateRecord(1, DOC_HASH2, META_HASH2);
            await tx.wait();

            // Old record: Superseded
            const oldRecord = await records.getRecord(1);
            expect(oldRecord.status).to.equal(2); // Superseded

            // New record: Active
            const newRecord = await records.getRecord(2);
            expect(newRecord.documentHash).to.equal(DOC_HASH2);
            expect(newRecord.metadataHash).to.equal(META_HASH2);
            expect(newRecord.parentId).to.equal(1);
            expect(newRecord.rootId).to.equal(1);
            expect(newRecord.status).to.equal(1); // Active
        });

        it("updates head pointer to new record", async function () {
            await records.connect(doctor).updateRecord(1, DOC_HASH2, META_HASH2);
            expect(await records.getActiveRecordId(1)).to.equal(2);
            expect(await records.isActiveRecord(1)).to.equal(false);
            expect(await records.isActiveRecord(2)).to.equal(true);
        });

        it("emits RecordVersioned", async function () {
            await expect(records.connect(doctor).updateRecord(1, DOC_HASH2, META_HASH2))
                .to.emit(records, "RecordVersioned")
                .withArgs(1, 2, 1, doctor.address, DOC_HASH2, META_HASH2, () => true);
        });

        it("reverts if not the original doctor", async function () {
            // doctor2 tries to update doctor's record
            const expiry = (await time.latest()) + 86400;
            await consent.connect(patient).grantConsent(doctor2.address, SCOPE_UPLOAD, expiry);

            await expect(
                records.connect(doctor2).updateRecord(1, DOC_HASH2, META_HASH2)
            ).to.be.revertedWithCustomError(records, "RecordAuthorMismatch");
        });

        it("reverts if record is already superseded", async function () {
            await records.connect(doctor).updateRecord(1, DOC_HASH2, META_HASH2);
            await expect(
                records.connect(doctor).updateRecord(1, DOC_HASH2, META_HASH2)
            ).to.be.revertedWithCustomError(records, "RecordNotActive");
        });

        it("reverts without consent", async function () {
            // Revoke consent, then try to update
            await consent.connect(patient).revokeConsent(doctor.address, ethers.id("reason"));
            await expect(
                records.connect(doctor).updateRecord(1, DOC_HASH2, META_HASH2)
            ).to.be.revertedWithCustomError(records, "ConsentRequired");
        });

        // ── GAS SNAPSHOT ──
        it("uses ≤ 140,000 gas (pre-optimizer; Phase 4 target: ≤ 50,000)", async function () {
            const tx = await records.connect(doctor).updateRecord(1, DOC_HASH2, META_HASH2);
            const receipt = await tx.wait();
            console.log(`    ⛽ updateRecord gas: ${receipt.gasUsed}`);
            expect(receipt.gasUsed).to.be.lessThanOrEqual(140000);
        });
    });

    // ═══════════════════════════════════════════════════════
    // REVOKE RECORD
    // ═══════════════════════════════════════════════════════

    describe("revokeRecord", function () {
        beforeEach(async function () {
            await records.connect(doctor).createRecord(patient.address, DOC_HASH, META_HASH);
        });

        it("patient can revoke their own record", async function () {
            await records.connect(patient).revokeRecord(1, ethers.id("invalid-document"));
            const record = await records.getRecord(1);
            expect(record.status).to.equal(3); // Revoked
        });

        it("owner (admin) can revoke any record", async function () {
            await records.connect(admin).revokeRecord(1, ethers.id("admin-revoke"));
            expect(await records.isActiveRecord(1)).to.equal(false);
        });

        it("clears head pointer", async function () {
            await records.connect(patient).revokeRecord(1, ethers.id("reason"));
            expect(await records.getActiveRecordId(1)).to.equal(0);
        });

        it("emits RecordRevoked", async function () {
            await expect(records.connect(patient).revokeRecord(1, ethers.id("reason")))
                .to.emit(records, "RecordRevoked")
                .withArgs(1, 1, patient.address, patient.address, ethers.id("reason"), () => true);
        });

        it("reverts if caller is not patient or owner", async function () {
            await expect(
                records.connect(doctor).revokeRecord(1, ethers.id("reason"))
            ).to.be.revertedWithCustomError(records, "Unauthorized");
        });

        it("reverts if record is not active", async function () {
            await records.connect(patient).revokeRecord(1, ethers.id("reason"));
            await expect(
                records.connect(patient).revokeRecord(1, ethers.id("reason2"))
            ).to.be.revertedWithCustomError(records, "RecordNotActive");
        });

        it("reverts for non-existent record", async function () {
            await expect(
                records.connect(patient).revokeRecord(999, ethers.id("reason"))
            ).to.be.revertedWithCustomError(records, "InvalidRecord");
        });
    });

    // ═══════════════════════════════════════════════════════
    // VERSION CHAIN INTEGRITY
    // ═══════════════════════════════════════════════════════

    describe("Version Chain", function () {
        it("maintains correct lineage through 3 versions", async function () {
            // v1
            await records.connect(doctor).createRecord(patient.address, DOC_HASH, META_HASH);
            // v2
            await records.connect(doctor).updateRecord(1, DOC_HASH2, META_HASH2);
            // v3
            const docHash3 = ethers.id("doc-v3");
            const metaHash3 = ethers.id("meta-v3");
            await records.connect(doctor).updateRecord(2, docHash3, metaHash3);

            // Check chain
            const v1 = await records.getRecord(1);
            expect(v1.status).to.equal(2); // Superseded
            expect(v1.parentId).to.equal(0);
            expect(v1.rootId).to.equal(1);

            const v2 = await records.getRecord(2);
            expect(v2.status).to.equal(2); // Superseded
            expect(v2.parentId).to.equal(1);
            expect(v2.rootId).to.equal(1);

            const v3 = await records.getRecord(3);
            expect(v3.status).to.equal(1); // Active
            expect(v3.parentId).to.equal(2);
            expect(v3.rootId).to.equal(1);

            // Head pointer
            expect(await records.getActiveRecordId(1)).to.equal(3);
        });
    });

    // ═══════════════════════════════════════════════════════
    // PACKED STORAGE INTEGRITY
    // ═══════════════════════════════════════════════════════

    describe("Packed Storage Integrity", function () {
        it("correctly unpacks all node fields", async function () {
            await records.connect(doctor).createRecord(patient.address, DOC_HASH, META_HASH);
            const record = await records.getRecord(1);

            expect(record.patient).to.equal(patient.address);
            expect(record.doctor).to.equal(doctor.address);
            expect(record.parentId).to.equal(0);
            expect(record.rootId).to.equal(1);
            expect(record.status).to.equal(1);
        });

        it("preserves patient/doctor IDs after status change", async function () {
            await records.connect(doctor).createRecord(patient.address, DOC_HASH, META_HASH);
            await records.connect(patient).revokeRecord(1, ethers.id("reason"));

            const record = await records.getRecord(1);
            expect(record.patient).to.equal(patient.address);
            expect(record.doctor).to.equal(doctor.address);
            expect(record.status).to.equal(3); // Revoked
        });
    });

    // ═══════════════════════════════════════════════════════
    // MULTI-PATIENT RECORDS
    // ═══════════════════════════════════════════════════════

    describe("Multi-Patient Records", function () {
        it("handles records for different patients independently", async function () {
            // Grant consent for patient2
            const expiry = (await time.latest()) + 86400;
            await consent.connect(patient2).grantConsent(doctor.address, SCOPE_UPLOAD, expiry);

            await records.connect(doctor).createRecord(patient.address, DOC_HASH, META_HASH);
            await records.connect(doctor).createRecord(patient2.address, DOC_HASH2, META_HASH2);

            const r1 = await records.getRecord(1);
            const r2 = await records.getRecord(2);

            expect(r1.patient).to.equal(patient.address);
            expect(r2.patient).to.equal(patient2.address);
            expect(r1.rootId).to.equal(1);
            expect(r2.rootId).to.equal(2);
        });
    });
});
