const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IdentityRegistryV2", function () {
    let registry;
    let admin, doctor, patient, auditor, stranger;

    beforeEach(async function () {
        [admin, doctor, patient, auditor, stranger] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("IdentityRegistryV2");
        registry = await Factory.deploy();
        await registry.waitForDeployment();
    });

    // ═══════════════════════════════════════════════════════
    // CONSTRUCTION & ADMIN BOOTSTRAP
    // ═══════════════════════════════════════════════════════

    describe("Construction", function () {
        it("registers deployer as admin with identityId=1", async function () {
            const identity = await registry.getIdentity(admin.address);
            expect(identity.role).to.equal(1); // Admin
            expect(identity.isActive).to.equal(true);
            expect(identity.identityId).to.equal(1);
        });

        it("sets deployer as owner", async function () {
            expect(await registry.owner()).to.equal(admin.address);
        });

        it("sets nextIdentityId to 2", async function () {
            expect(await registry.nextIdentityId()).to.equal(2);
        });

        it("maps identityId=1 to deployer address", async function () {
            expect(await registry.idToAddress(1)).to.equal(admin.address);
        });

        it("emits IdentityRegistered on deploy", async function () {
            // Re-deploy to capture event
            const Factory = await ethers.getContractFactory("IdentityRegistryV2");
            const tx = await Factory.deploy();
            const receipt = await tx.deploymentTransaction().wait();
            const events = receipt.logs;
            expect(events.length).to.be.greaterThan(0);
        });
    });

    // ═══════════════════════════════════════════════════════
    // IDENTITY REGISTRATION
    // ═══════════════════════════════════════════════════════

    describe("registerIdentity", function () {
        it("registers a doctor with sequential identityId", async function () {
            const tx = await registry.registerIdentity(doctor.address, 2); // Doctor
            const receipt = await tx.wait();

            const identity = await registry.getIdentity(doctor.address);
            expect(identity.role).to.equal(2);
            expect(identity.isActive).to.equal(true);
            expect(identity.identityId).to.equal(2);

            expect(await registry.nextIdentityId()).to.equal(3);
        });

        it("registers a patient with the next identityId", async function () {
            await registry.registerIdentity(doctor.address, 2);
            await registry.registerIdentity(patient.address, 3); // Patient

            const identity = await registry.getIdentity(patient.address);
            expect(identity.role).to.equal(3);
            expect(identity.identityId).to.equal(3);

            expect(await registry.nextIdentityId()).to.equal(4);
        });

        it("registers an auditor", async function () {
            await registry.registerIdentity(auditor.address, 4); // Auditor
            const identity = await registry.getIdentity(auditor.address);
            expect(identity.role).to.equal(4);
            expect(identity.isActive).to.equal(true);
        });

        it("emits IdentityRegistered with correct args", async function () {
            await expect(registry.registerIdentity(doctor.address, 2))
                .to.emit(registry, "IdentityRegistered")
                .withArgs(doctor.address, 2, 2, () => true); // identityId=2, any timestamp
        });

        it("reverts for zero address", async function () {
            await expect(
                registry.registerIdentity(ethers.ZeroAddress, 2)
            ).to.be.revertedWithCustomError(registry, "InvalidAccount");
        });

        it("reverts for Role.None", async function () {
            await expect(
                registry.registerIdentity(doctor.address, 0)
            ).to.be.revertedWithCustomError(registry, "InvalidRole");
        });

        it("reverts for duplicate registration", async function () {
            await registry.registerIdentity(doctor.address, 2);
            await expect(
                registry.registerIdentity(doctor.address, 3)
            ).to.be.revertedWithCustomError(registry, "IdentityAlreadyExists");
        });

        it("reverts when called by non-owner", async function () {
            await expect(
                registry.connect(stranger).registerIdentity(doctor.address, 2)
            ).to.be.revertedWithCustomError(registry, "NotOwner");
        });

        // ── GAS SNAPSHOT ──
        it("uses ≤ 76,000 gas (pre-optimizer; Phase 4 target: ≤ 35,000)", async function () {
            const tx = await registry.registerIdentity(doctor.address, 2);
            const receipt = await tx.wait();
            console.log(`    ⛽ registerIdentity gas: ${receipt.gasUsed}`);
            // Pre-optimizer: cold SSTORE (new address → _packed + idToAddress) = ~75k
            // Phase 4 enables optimizer (runs=200) which reduces this significantly.
            // Post-optimizer target: ≤ 35,000 gas (amortized warm path).
            expect(receipt.gasUsed).to.be.lessThanOrEqual(76000);
        });
    });

    // ═══════════════════════════════════════════════════════
    // ROLE MANAGEMENT
    // ═══════════════════════════════════════════════════════

    describe("updateRole", function () {
        beforeEach(async function () {
            await registry.registerIdentity(doctor.address, 2);
        });

        it("changes role from Doctor to Auditor", async function () {
            await registry.updateRole(doctor.address, 4);
            const identity = await registry.getIdentity(doctor.address);
            expect(identity.role).to.equal(4);
        });

        it("emits RoleUpdated with old and new role", async function () {
            await expect(registry.updateRole(doctor.address, 4))
                .to.emit(registry, "RoleUpdated")
                .withArgs(doctor.address, 2, 4, () => true);
        });

        it("reverts for Role.None", async function () {
            await expect(
                registry.updateRole(doctor.address, 0)
            ).to.be.revertedWithCustomError(registry, "InvalidRole");
        });

        it("reverts for unregistered address", async function () {
            await expect(
                registry.updateRole(stranger.address, 2)
            ).to.be.revertedWithCustomError(registry, "IdentityNotFound");
        });

        it("reverts when called by non-owner", async function () {
            await expect(
                registry.connect(stranger).updateRole(doctor.address, 4)
            ).to.be.revertedWithCustomError(registry, "NotOwner");
        });
    });

    // ═══════════════════════════════════════════════════════
    // STATUS MANAGEMENT
    // ═══════════════════════════════════════════════════════

    describe("setIdentityStatus", function () {
        beforeEach(async function () {
            await registry.registerIdentity(doctor.address, 2);
        });

        it("deactivates an identity", async function () {
            await registry.setIdentityStatus(doctor.address, false);
            const identity = await registry.getIdentity(doctor.address);
            expect(identity.isActive).to.equal(false);
        });

        it("reactivates an identity", async function () {
            await registry.setIdentityStatus(doctor.address, false);
            await registry.setIdentityStatus(doctor.address, true);
            const identity = await registry.getIdentity(doctor.address);
            expect(identity.isActive).to.equal(true);
        });

        it("emits IdentityStatusChanged", async function () {
            await expect(registry.setIdentityStatus(doctor.address, false))
                .to.emit(registry, "IdentityStatusChanged")
                .withArgs(doctor.address, false, () => true);
        });

        it("reverts if status is unchanged", async function () {
            await expect(
                registry.setIdentityStatus(doctor.address, true) // already active
            ).to.be.revertedWithCustomError(registry, "StatusUnchanged");
        });

        it("reverts for unregistered address", async function () {
            await expect(
                registry.setIdentityStatus(stranger.address, false)
            ).to.be.revertedWithCustomError(registry, "IdentityNotFound");
        });
    });

    // ═══════════════════════════════════════════════════════
    // ROLE QUERIES (hasRole / isActiveIdentity)
    // ═══════════════════════════════════════════════════════

    describe("hasRole", function () {
        beforeEach(async function () {
            await registry.registerIdentity(doctor.address, 2);
            await registry.registerIdentity(patient.address, 3);
        });

        it("returns true for correct active role", async function () {
            expect(await registry.hasRole(doctor.address, 2)).to.equal(true);
            expect(await registry.hasRole(patient.address, 3)).to.equal(true);
        });

        it("returns false for wrong role", async function () {
            expect(await registry.hasRole(doctor.address, 3)).to.equal(false);
        });

        it("returns false for deactivated identity", async function () {
            await registry.setIdentityStatus(doctor.address, false);
            expect(await registry.hasRole(doctor.address, 2)).to.equal(false);
        });

        it("returns false for unregistered address", async function () {
            expect(await registry.hasRole(stranger.address, 2)).to.equal(false);
        });
    });

    describe("isActiveIdentity", function () {
        it("returns true for active registered identity", async function () {
            await registry.registerIdentity(doctor.address, 2);
            expect(await registry.isActiveIdentity(doctor.address)).to.equal(true);
        });

        it("returns false for deactivated identity", async function () {
            await registry.registerIdentity(doctor.address, 2);
            await registry.setIdentityStatus(doctor.address, false);
            expect(await registry.isActiveIdentity(doctor.address)).to.equal(false);
        });

        it("returns false for unregistered address", async function () {
            expect(await registry.isActiveIdentity(stranger.address)).to.equal(false);
        });
    });

    // ═══════════════════════════════════════════════════════
    // ID RESOLUTION (address ↔ identityId)
    // ═══════════════════════════════════════════════════════

    describe("ID Resolution", function () {
        it("getIdentityId returns the correct ID", async function () {
            await registry.registerIdentity(doctor.address, 2);
            expect(await registry.getIdentityId(doctor.address)).to.equal(2);
        });

        it("getAddressByIdentityId returns the correct address", async function () {
            await registry.registerIdentity(doctor.address, 2);
            expect(await registry.getAddressByIdentityId(2)).to.equal(doctor.address);
        });

        it("admin has identityId=1", async function () {
            expect(await registry.getIdentityId(admin.address)).to.equal(1);
            expect(await registry.getAddressByIdentityId(1)).to.equal(admin.address);
        });

        it("getIdentityId reverts for unregistered address", async function () {
            await expect(
                registry.getIdentityId(stranger.address)
            ).to.be.revertedWithCustomError(registry, "IdentityNotFound");
        });

        it("getAddressByIdentityId reverts for non-existent ID", async function () {
            await expect(
                registry.getAddressByIdentityId(999)
            ).to.be.revertedWithCustomError(registry, "IdentityNotFound");
        });
    });

    // ═══════════════════════════════════════════════════════
    // PACKED STORAGE INTEGRITY
    // ═══════════════════════════════════════════════════════

    describe("Packed Storage Integrity", function () {
        it("preserves all fields across role update", async function () {
            await registry.registerIdentity(doctor.address, 2);
            const before = await registry.getIdentity(doctor.address);

            await registry.updateRole(doctor.address, 4); // Doctor → Auditor
            const after = await registry.getIdentity(doctor.address);

            // Role changed
            expect(after.role).to.equal(4);
            // Everything else preserved
            expect(after.isActive).to.equal(before.isActive);
            expect(after.registeredAt).to.equal(before.registeredAt);
            expect(after.identityId).to.equal(before.identityId);
        });

        it("preserves all fields across status change", async function () {
            await registry.registerIdentity(doctor.address, 2);
            const before = await registry.getIdentity(doctor.address);

            await registry.setIdentityStatus(doctor.address, false);
            const after = await registry.getIdentity(doctor.address);

            // Status changed
            expect(after.isActive).to.equal(false);
            // Everything else preserved
            expect(after.role).to.equal(before.role);
            expect(after.registeredAt).to.equal(before.registeredAt);
            expect(after.identityId).to.equal(before.identityId);
        });

        it("handles sequential registrations with correct IDs", async function () {
            await registry.registerIdentity(doctor.address, 2);   // id=2
            await registry.registerIdentity(patient.address, 3);  // id=3
            await registry.registerIdentity(auditor.address, 4);  // id=4

            expect(await registry.getIdentityId(doctor.address)).to.equal(2);
            expect(await registry.getIdentityId(patient.address)).to.equal(3);
            expect(await registry.getIdentityId(auditor.address)).to.equal(4);
            expect(await registry.nextIdentityId()).to.equal(5);
        });
    });

    // ═══════════════════════════════════════════════════════
    // OWNERSHIP
    // ═══════════════════════════════════════════════════════

    describe("Ownership", function () {
        it("transfers ownership", async function () {
            await registry.transferOwnership(stranger.address);
            expect(await registry.owner()).to.equal(stranger.address);
        });

        it("new owner can register identities", async function () {
            await registry.transferOwnership(stranger.address);
            await registry.connect(stranger).registerIdentity(doctor.address, 2);
            expect(await registry.hasRole(doctor.address, 2)).to.equal(true);
        });

        it("old owner loses access after transfer", async function () {
            await registry.transferOwnership(stranger.address);
            await expect(
                registry.registerIdentity(doctor.address, 2)
            ).to.be.revertedWithCustomError(registry, "NotOwner");
        });

        it("reverts transfer to zero address", async function () {
            await expect(
                registry.transferOwnership(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(registry, "InvalidNewOwner");
        });

        it("emits OwnershipTransferred event", async function () {
            await expect(registry.transferOwnership(stranger.address))
                .to.emit(registry, "OwnershipTransferred")
                .withArgs(admin.address, stranger.address);
        });
    });
});
