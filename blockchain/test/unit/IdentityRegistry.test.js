const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IdentityRegistry", function () {
    let registry;
    let admin, doctor, patient, stranger;

    beforeEach(async function () {
        [admin, doctor, patient, stranger] = await ethers.getSigners();
        const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
        registry = await IdentityRegistry.deploy();
    });

    it("registers the deployer as admin", async function () {
        const identity = await registry.getIdentity(admin.address);
        expect(identity.role).to.equal(1);
        expect(identity.isActive).to.equal(true);
    });

    it("allows admin to register doctor and patient roles", async function () {
        await registry.registerIdentity(doctor.address, 2);
        await registry.registerIdentity(patient.address, 3);

        expect(await registry.hasRole(doctor.address, 2)).to.equal(true);
        expect(await registry.hasRole(patient.address, 3)).to.equal(true);
    });

    it("blocks non-admin registration", async function () {
        await expect(
            registry.connect(stranger).registerIdentity(doctor.address, 2)
        ).to.be.revertedWithCustomError(registry, "NotAdmin");
    });

    it("can deactivate an existing identity", async function () {
        await registry.registerIdentity(doctor.address, 2);
        await registry.setIdentityStatus(doctor.address, false);

        expect(await registry.hasRole(doctor.address, 2)).to.equal(false);
    });
});
