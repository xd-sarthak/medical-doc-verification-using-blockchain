// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ReentrancyAttacker
 * @notice Test-only contract that attempts a reentrancy attack on DoctorManagement.
 *         Used in security tests to verify that state changes happen before
 *         external calls, preventing reentrancy exploits.
 */

interface IDoctorManagement {
    function addPatientAccess(address _doctorAddress, address _patientAddress) external;
    function revokePatientAccess(address _doctorAddress, address _patientAddress) external;
    function isAuthorized(address _doctorAddress, address _patientAddress) external view returns (bool);
}

contract ReentrancyAttacker {
    IDoctorManagement public target;
    address public doctorAddr;
    address public patientAddr;
    uint256 public attackCount;
    bool public attacking;

    constructor(address _target) {
        target = IDoctorManagement(_target);
    }

    function setParams(address _doctor, address _patient) external {
        doctorAddr = _doctor;
        patientAddr = _patient;
    }

    // Attempt to call revokePatientAccess repeatedly
    function attack() external {
        attacking = true;
        attackCount = 0;
        target.revokePatientAccess(doctorAddr, patientAddr);
    }

    // Fallback — tries to re-enter revokePatientAccess
    receive() external payable {
        if (attacking && attackCount < 3) {
            attackCount++;
            try target.revokePatientAccess(doctorAddr, patientAddr) {} catch {}
        }
    }
}
