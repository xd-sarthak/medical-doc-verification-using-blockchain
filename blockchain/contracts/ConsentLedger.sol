// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "./IdentityRegistry.sol";

contract ConsentLedger is Initializable, UUPSUpgradeable, Ownable2StepUpgradeable {
    uint8 public constant SCOPE_VIEW = 1;
    uint8 public constant SCOPE_UPLOAD = 2;
    uint8 public constant SCOPE_FULL = SCOPE_VIEW | SCOPE_UPLOAD;

    struct ActiveConsent {
        uint64 expiresAt;
        uint32 nonce;
        uint8 scope;
    }

    IdentityRegistry public identityRegistry;
    mapping(address => mapping(address => ActiveConsent)) public activeConsents;
    mapping(address => mapping(address => uint32)) public consentNonces;

    event ConsentGranted(
        address indexed patient,
        address indexed doctor,
        uint8 scope,
        uint32 nonce,
        uint64 issuedAt,
        uint64 expiresAt
    );

    event ConsentRevoked(
        address indexed patient,
        address indexed doctor,
        uint32 nonce,
        bytes32 revocationCode,
        uint64 revokedAt
    );

    event ConsentExpired(address indexed patient, address indexed doctor, uint32 nonce, uint64 expiredAt);

    error InvalidRegistry();
    error InvalidDoctor();
    error InvalidPatient();
    error InvalidScope();
    error InvalidExpiry();
    error ActiveConsentExists();
    error ConsentNotRevocable();
    error ConsentNotExpired();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address registryAddress) initializer public {
        if (registryAddress == address(0)) revert InvalidRegistry();
        __Ownable_init(msg.sender);
        __Ownable2Step_init();
        
        identityRegistry = IdentityRegistry(registryAddress);
    }

    function _authorizeUpgrade(address newImplementation) internal onlyOwner override {}

    function grantConsent(
        address doctor,
        uint8 scope,
        uint64 expiresAt
    ) external returns (uint32 nonce) {
        if (!_isActiveRole(msg.sender, IdentityRegistry.Role.Patient)) revert InvalidPatient();
        if (!_isActiveRole(doctor, IdentityRegistry.Role.Doctor)) revert InvalidDoctor();
        if (!_isValidScope(scope)) revert InvalidScope();
        if (expiresAt <= _timestamp()) revert InvalidExpiry();

        ActiveConsent storage existingConsent = activeConsents[msg.sender][doctor];
        if (_isCurrentlyActive(existingConsent)) {
            revert ActiveConsentExists();
        }

        uint64 issuedAt = _timestamp();
        nonce = ++consentNonces[msg.sender][doctor];
        activeConsents[msg.sender][doctor] = ActiveConsent({
            expiresAt: expiresAt,
            nonce: nonce,
            scope: scope
        });

        emit ConsentGranted(msg.sender, doctor, scope, nonce, issuedAt, expiresAt);
    }

    function revokeConsent(address doctor, bytes32 revocationCode) external {
        ActiveConsent storage consent = activeConsents[msg.sender][doctor];

        if (!_isCurrentlyActive(consent)) revert ConsentNotRevocable();

        uint64 revokedAt = _timestamp();
        uint32 nonce = consent.nonce;
        delete activeConsents[msg.sender][doctor];

        emit ConsentRevoked(msg.sender, doctor, nonce, revocationCode, revokedAt);
    }

    function getActiveConsent(address patient, address doctor) external view returns (ActiveConsent memory consent) {
        consent = activeConsents[patient][doctor];
        if (!_isCurrentlyActive(consent)) {
            consent.expiresAt = 0;
        }
    }

    function hasValidConsent(
        address patient,
        address doctor,
        uint8 requiredScope
    ) external view returns (bool) {
        ActiveConsent memory consent = activeConsents[patient][doctor];
        return _isCurrentlyActive(consent) && _coversScope(consent.scope, requiredScope);
    }

    function expireConsent(
        address patient,
        address doctor
    ) external returns (bool) {
        ActiveConsent storage consent = activeConsents[patient][doctor];
        if (consent.nonce == 0) {
            return false;
        }

        if (consent.expiresAt > _timestamp()) {
            revert ConsentNotExpired();
        }

        uint32 nonce = consent.nonce;
        uint64 expiredAt = _timestamp();
        delete activeConsents[patient][doctor];
        emit ConsentExpired(patient, doctor, nonce, expiredAt);
        return true;
    }

    function _coversScope(uint8 granted, uint8 requiredScope) internal pure returns (bool) {
        return granted != 0 && (granted & requiredScope) == requiredScope;
    }

    function _isCurrentlyActive(ActiveConsent memory consent) internal view returns (bool) {
        return consent.nonce != 0 && consent.expiresAt > _timestamp();
    }

    function _isActiveRole(address account, IdentityRegistry.Role role) internal view returns (bool) {
        return identityRegistry.hasRole(account, role);
    }

    function _isValidScope(uint8 scope) internal pure returns (bool) {
        return scope == SCOPE_VIEW || scope == SCOPE_UPLOAD || scope == SCOPE_FULL;
    }

    function _timestamp() internal view returns (uint64) {
        return uint64(block.timestamp);
    }
}
