const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ConsentLedgerV2", function () {
    let registry, consent;
    let admin, doctor, doctor2, doctor3, patient, stranger;

    const SCOPE_VIEW   = 1;
    const SCOPE_UPLOAD = 2;
    const SCOPE_FULL   = 3;

    beforeEach(async function () {
        [admin, doctor, doctor2, doctor3, patient, stranger] = await ethers.getSigners();

        // Deploy IdentityRegistryV2
        const RegistryFactory = await ethers.getContractFactory("IdentityRegistryV2");
        registry = await RegistryFactory.deploy();
        await registry.waitForDeployment();

        // Deploy ConsentLedgerV2
        const ConsentFactory = await ethers.getContractFactory("ConsentLedgerV2");
        consent = await ConsentFactory.deploy(await registry.getAddress());
        await consent.waitForDeployment();

        // Register identities
        await registry.registerIdentity(doctor.address, 2);   // Doctor, id=2
        await registry.registerIdentity(doctor2.address, 2);   // Doctor, id=3
        await registry.registerIdentity(doctor3.address, 2);   // Doctor, id=4
        await registry.registerIdentity(patient.address, 3);   // Patient, id=5
    });

    // ═══════════════════════════════════════════════════════
    // GRANT CONSENT
    // ═══════════════════════════════════════════════════════

    describe("grantConsent", function () {
        it("grants consent with nonce=1", async function () {
            const expiry = (await time.latest()) + 3600;
            const tx = await consent.connect(patient).grantConsent(doctor.address, SCOPE_UPLOAD, expiry);
            await tx.wait();

            const active = await consent.getActiveConsent(patient.address, doctor.address);
            expect(active.nonce).to.equal(1);
            expect(active.scope).to.equal(SCOPE_UPLOAD);
            expect(active.expiresAt).to.equal(expiry);
        });

        it("emits ConsentGranted with correct args", async function () {
            const expiry = (await time.latest()) + 3600;
            await expect(consent.connect(patient).grantConsent(doctor.address, SCOPE_VIEW, expiry))
                .to.emit(consent, "ConsentGranted")
                .withArgs(patient.address, doctor.address, SCOPE_VIEW, 1, () => true, expiry);
        });

        it("reverts if caller is not a patient", async function () {
            const expiry = (await time.latest()) + 3600;
            await expect(
                consent.connect(doctor).grantConsent(doctor2.address, SCOPE_VIEW, expiry)
            ).to.be.revertedWithCustomError(consent, "InvalidPatient");
        });

        it("reverts if target is not a doctor", async function () {
            const expiry = (await time.latest()) + 3600;
            await expect(
                consent.connect(patient).grantConsent(stranger.address, SCOPE_VIEW, expiry)
            ).to.be.revertedWithCustomError(consent, "InvalidDoctor");
        });

        it("reverts for invalid scope (0)", async function () {
            const expiry = (await time.latest()) + 3600;
            await expect(
                consent.connect(patient).grantConsent(doctor.address, 0, expiry)
            ).to.be.revertedWithCustomError(consent, "InvalidScope");
        });

        it("reverts for invalid scope (4)", async function () {
            const expiry = (await time.latest()) + 3600;
            await expect(
                consent.connect(patient).grantConsent(doctor.address, 4, expiry)
            ).to.be.revertedWithCustomError(consent, "InvalidScope");
        });

        it("reverts for past expiry", async function () {
            const pastExpiry = (await time.latest()) - 100;
            await expect(
                consent.connect(patient).grantConsent(doctor.address, SCOPE_VIEW, pastExpiry)
            ).to.be.revertedWithCustomError(consent, "InvalidExpiry");
        });

        it("reverts if active consent already exists", async function () {
            const expiry = (await time.latest()) + 3600;
            await consent.connect(patient).grantConsent(doctor.address, SCOPE_VIEW, expiry);
            await expect(
                consent.connect(patient).grantConsent(doctor.address, SCOPE_UPLOAD, expiry)
            ).to.be.revertedWithCustomError(consent, "ActiveConsentExists");
        });

        // ── GAS SNAPSHOT ──
        it("uses ≤ 90,000 gas (pre-optimizer; Phase 4 target: ≤ 55,000)", async function () {
            const expiry = (await time.latest()) + 3600;
            const tx = await consent.connect(patient).grantConsent(doctor.address, SCOPE_UPLOAD, expiry);
            const receipt = await tx.wait();
            console.log(`    ⛽ grantConsent gas: ${receipt.gasUsed}`);
            expect(receipt.gasUsed).to.be.lessThanOrEqual(90000);
        });
    });

    // ═══════════════════════════════════════════════════════
    // REVOKE CONSENT
    // ═══════════════════════════════════════════════════════

    describe("revokeConsent", function () {
        beforeEach(async function () {
            const expiry = (await time.latest()) + 3600;
            await consent.connect(patient).grantConsent(doctor.address, SCOPE_UPLOAD, expiry);
        });

        it("revokes active consent", async function () {
            await consent.connect(patient).revokeConsent(doctor.address, ethers.id("reason"));
            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_UPLOAD)).to.equal(false);
        });

        it("preserves nonce after revoke", async function () {
            await consent.connect(patient).revokeConsent(doctor.address, ethers.id("reason"));
            const active = await consent.getActiveConsent(patient.address, doctor.address);
            expect(active.nonce).to.equal(1);  // nonce preserved
            expect(active.expiresAt).to.equal(0);  // but expired
        });

        it("emits ConsentRevoked", async function () {
            await expect(consent.connect(patient).revokeConsent(doctor.address, ethers.id("reason")))
                .to.emit(consent, "ConsentRevoked")
                .withArgs(patient.address, doctor.address, 1, ethers.id("reason"), () => true);
        });

        it("reverts if no active consent", async function () {
            await consent.connect(patient).revokeConsent(doctor.address, ethers.id("reason"));
            await expect(
                consent.connect(patient).revokeConsent(doctor.address, ethers.id("reason2"))
            ).to.be.revertedWithCustomError(consent, "ConsentNotRevocable");
        });

        it("reverts if caller is not a patient", async function () {
            await expect(
                consent.connect(doctor).revokeConsent(doctor.address, ethers.id("reason"))
            ).to.be.revertedWithCustomError(consent, "InvalidPatient");
        });
    });

    // ═══════════════════════════════════════════════════════
    // NONCE MONOTONICITY (grant → revoke → re-grant)
    // ═══════════════════════════════════════════════════════

    describe("Nonce Monotonicity", function () {
        it("increments nonce on re-grant after revoke", async function () {
            const expiry = (await time.latest()) + 3600;

            // Grant #1 (nonce=1)
            await consent.connect(patient).grantConsent(doctor.address, SCOPE_VIEW, expiry);
            let active = await consent.getActiveConsent(patient.address, doctor.address);
            expect(active.nonce).to.equal(1);

            // Revoke
            await consent.connect(patient).revokeConsent(doctor.address, ethers.id("r1"));

            // Grant #2 (nonce=2)
            const expiry2 = (await time.latest()) + 7200;
            await consent.connect(patient).grantConsent(doctor.address, SCOPE_UPLOAD, expiry2);
            active = await consent.getActiveConsent(patient.address, doctor.address);
            expect(active.nonce).to.equal(2);
            expect(active.scope).to.equal(SCOPE_UPLOAD);
        });

        it("allows re-grant after expiry", async function () {
            const shortExpiry = (await time.latest()) + 60;
            await consent.connect(patient).grantConsent(doctor.address, SCOPE_VIEW, shortExpiry);

            // Fast-forward past expiry
            await time.increase(120);

            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_VIEW)).to.equal(false);

            // Re-grant should succeed (expired consent is not "active")
            const newExpiry = (await time.latest()) + 3600;
            await consent.connect(patient).grantConsent(doctor.address, SCOPE_FULL, newExpiry);

            const active = await consent.getActiveConsent(patient.address, doctor.address);
            expect(active.nonce).to.equal(2);
            expect(active.scope).to.equal(SCOPE_FULL);
        });
    });

    // ═══════════════════════════════════════════════════════
    // hasValidConsent
    // ═══════════════════════════════════════════════════════

    describe("hasValidConsent", function () {
        it("returns true for active consent with matching scope", async function () {
            const expiry = (await time.latest()) + 3600;
            await consent.connect(patient).grantConsent(doctor.address, SCOPE_FULL, expiry);

            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_VIEW)).to.equal(true);
            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_UPLOAD)).to.equal(true);
            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_FULL)).to.equal(true);
        });

        it("returns false for insufficient scope", async function () {
            const expiry = (await time.latest()) + 3600;
            await consent.connect(patient).grantConsent(doctor.address, SCOPE_VIEW, expiry);

            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_UPLOAD)).to.equal(false);
        });

        it("returns false after expiry", async function () {
            const shortExpiry = (await time.latest()) + 60;
            await consent.connect(patient).grantConsent(doctor.address, SCOPE_VIEW, shortExpiry);

            await time.increase(120);
            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_VIEW)).to.equal(false);
        });

        it("returns false for unregistered patient", async function () {
            expect(await consent.hasValidConsent(stranger.address, doctor.address, SCOPE_VIEW)).to.equal(false);
        });

        it("returns false for unregistered doctor", async function () {
            expect(await consent.hasValidConsent(patient.address, stranger.address, SCOPE_VIEW)).to.equal(false);
        });
    });

    // ═══════════════════════════════════════════════════════
    // BATCH OPERATIONS
    // ═══════════════════════════════════════════════════════

    describe("grantConsentBatch", function () {
        it("grants consent to multiple doctors in one tx", async function () {
            const expiry = (await time.latest()) + 3600;
            await consent.connect(patient).grantConsentBatch(
                [doctor.address, doctor2.address, doctor3.address],
                SCOPE_UPLOAD,
                expiry
            );

            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_UPLOAD)).to.equal(true);
            expect(await consent.hasValidConsent(patient.address, doctor2.address, SCOPE_UPLOAD)).to.equal(true);
            expect(await consent.hasValidConsent(patient.address, doctor3.address, SCOPE_UPLOAD)).to.equal(true);
        });

        it("reverts for empty array", async function () {
            const expiry = (await time.latest()) + 3600;
            await expect(
                consent.connect(patient).grantConsentBatch([], SCOPE_VIEW, expiry)
            ).to.be.revertedWithCustomError(consent, "EmptyBatch");
        });

        it("reverts if any doctor is invalid", async function () {
            const expiry = (await time.latest()) + 3600;
            await expect(
                consent.connect(patient).grantConsentBatch(
                    [doctor.address, stranger.address],
                    SCOPE_VIEW,
                    expiry
                )
            ).to.be.revertedWithCustomError(consent, "InvalidDoctor");
        });
    });

    describe("revokeConsentBatch", function () {
        beforeEach(async function () {
            const expiry = (await time.latest()) + 3600;
            await consent.connect(patient).grantConsentBatch(
                [doctor.address, doctor2.address],
                SCOPE_UPLOAD,
                expiry
            );
        });

        it("revokes consent from multiple doctors in one tx", async function () {
            await consent.connect(patient).revokeConsentBatch(
                [doctor.address, doctor2.address],
                ethers.id("batch-revoke")
            );

            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_UPLOAD)).to.equal(false);
            expect(await consent.hasValidConsent(patient.address, doctor2.address, SCOPE_UPLOAD)).to.equal(false);
        });

        it("reverts for empty array", async function () {
            await expect(
                consent.connect(patient).revokeConsentBatch([], ethers.id("reason"))
            ).to.be.revertedWithCustomError(consent, "EmptyBatch");
        });
    });

    // ═══════════════════════════════════════════════════════
    // SCOPE VALIDATION
    // ═══════════════════════════════════════════════════════

    describe("Scope Handling", function () {
        it("SCOPE_FULL covers both VIEW and UPLOAD", async function () {
            const expiry = (await time.latest()) + 3600;
            await consent.connect(patient).grantConsent(doctor.address, SCOPE_FULL, expiry);

            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_VIEW)).to.equal(true);
            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_UPLOAD)).to.equal(true);
            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_FULL)).to.equal(true);
        });

        it("SCOPE_VIEW does not cover UPLOAD", async function () {
            const expiry = (await time.latest()) + 3600;
            await consent.connect(patient).grantConsent(doctor.address, SCOPE_VIEW, expiry);

            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_VIEW)).to.equal(true);
            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_UPLOAD)).to.equal(false);
        });

        it("SCOPE_UPLOAD does not cover VIEW", async function () {
            const expiry = (await time.latest()) + 3600;
            await consent.connect(patient).grantConsent(doctor.address, SCOPE_UPLOAD, expiry);

            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_UPLOAD)).to.equal(true);
            expect(await consent.hasValidConsent(patient.address, doctor.address, SCOPE_VIEW)).to.equal(false);
        });
    });
});
