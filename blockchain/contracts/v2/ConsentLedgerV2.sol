// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IdentityRegistryV2.sol";

/**
 * @title ConsentLedgerV2
 * @notice Gas-optimized consent management using packed single-word storage.
 *
 * Consent key:  uint64 compositeKey = (uint32 patientId << 32) | uint32 doctorId
 * Consent word: [expiresAt(64) | nonce(32) | scope(8) | _reserved(152)]
 *
 * Total: 104 bits used per consent pair.
 *
 * Design decisions:
 *   - Key by composite uint64 from identity IDs → 1 hash vs nested mapping's 2 hashes.
 *   - issuedAt removed from storage → available only in ConsentGranted event.
 *   - Nonce is monotonic inside the packed word; on revoke we zero expiresAt + scope
 *     but preserve the nonce, eliminating the separate consentNonces mapping.
 *   - expireConsent() removed; expired consents are overwritten on next grant.
 */
contract ConsentLedgerV2 {
    // ───────────────────── Constants ─────────────────────

    uint8 public constant SCOPE_VIEW   = 1;
    uint8 public constant SCOPE_UPLOAD = 2;
    uint8 public constant SCOPE_FULL   = SCOPE_VIEW | SCOPE_UPLOAD; // 3

    // ───────────────────── Storage ─────────────────────

    IdentityRegistryV2 public immutable identityRegistry;

    /// @dev Packed consent word keyed by composite (patientId, doctorId).
    mapping(uint64 => uint256) internal _consents;

    // ───────────────────── Events ─────────────────────

    event ConsentGranted(
        address indexed patient,
        address indexed doctor,
        uint8   scope,
        uint32  nonce,
        uint64  issuedAt,
        uint64  expiresAt
    );

    event ConsentRevoked(
        address indexed patient,
        address indexed doctor,
        uint32  nonce,
        bytes32 revocationCode,
        uint64  revokedAt
    );

    // ───────────────────── Errors ─────────────────────

    error InvalidDoctor();
    error InvalidPatient();
    error InvalidScope();
    error InvalidExpiry();
    error ActiveConsentExists();
    error ConsentNotRevocable();
    error EmptyBatch();

    // ───────────────────── Packing layout ─────────────────────
    //
    // Bits [0..63]    expiresAt   (uint64)
    // Bits [64..95]   nonce       (uint32)
    // Bits [96..103]  scope       (uint8)
    //

    uint256 private constant EXPIRES_MASK  = 0xFFFFFFFFFFFFFFFF;
    uint256 private constant NONCE_SHIFT   = 64;
    uint256 private constant NONCE_MASK    = uint256(0xFFFFFFFF) << NONCE_SHIFT;
    uint256 private constant SCOPE_SHIFT   = 96;
    uint256 private constant SCOPE_MASK    = uint256(0xFF) << SCOPE_SHIFT;

    // ───────────────────── Constructor ─────────────────────

    constructor(address registryAddress) {
        if (registryAddress == address(0)) revert InvalidPatient();
        identityRegistry = IdentityRegistryV2(registryAddress);
    }

    // ───────────────────── Write: single consent ─────────────────────

    function grantConsent(
        address doctor,
        uint8   scope,
        uint64  expiresAt
    ) external returns (uint32 nonce) {
        if (!identityRegistry.hasRole(msg.sender, IdentityRegistryV2.Role.Patient))
            revert InvalidPatient();
        if (!identityRegistry.hasRole(doctor, IdentityRegistryV2.Role.Doctor))
            revert InvalidDoctor();
        if (!_isValidScope(scope)) revert InvalidScope();
        if (expiresAt <= uint64(block.timestamp)) revert InvalidExpiry();

        uint64 key = _keyFor(msg.sender, doctor);
        uint256 packed = _consents[key];

        if (_isActive(packed)) revert ActiveConsentExists();

        // Increment nonce from whatever is already in the word (survives revoke)
        uint32 existingNonce = uint32((packed & NONCE_MASK) >> NONCE_SHIFT);
        nonce = existingNonce + 1;

        _consents[key] = _pack(expiresAt, nonce, scope);

        emit ConsentGranted(msg.sender, doctor, scope, nonce, uint64(block.timestamp), expiresAt);
    }

    function revokeConsent(address doctor, bytes32 revocationCode) external {
        if (!identityRegistry.hasRole(msg.sender, IdentityRegistryV2.Role.Patient))
            revert InvalidPatient();

        uint64 key = _keyFor(msg.sender, doctor);
        uint256 packed = _consents[key];

        if (!_isActive(packed)) revert ConsentNotRevocable();

        uint32 nonce = uint32((packed & NONCE_MASK) >> NONCE_SHIFT);

        // Zero expiresAt + scope but preserve nonce for monotonicity
        _consents[key] = uint256(nonce) << NONCE_SHIFT;

        emit ConsentRevoked(msg.sender, doctor, nonce, revocationCode, uint64(block.timestamp));
    }

    // ───────────────────── Write: batch consent ─────────────────────

    function grantConsentBatch(
        address[] calldata doctors,
        uint8   scope,
        uint64  expiresAt
    ) external {
        if (doctors.length == 0) revert EmptyBatch();
        if (!identityRegistry.hasRole(msg.sender, IdentityRegistryV2.Role.Patient))
            revert InvalidPatient();
        if (!_isValidScope(scope)) revert InvalidScope();
        if (expiresAt <= uint64(block.timestamp)) revert InvalidExpiry();

        uint32 patientId = identityRegistry.getIdentityId(msg.sender);
        uint64 issuedAt = uint64(block.timestamp);

        for (uint256 i = 0; i < doctors.length; i++) {
            address doctor = doctors[i];
            if (!identityRegistry.hasRole(doctor, IdentityRegistryV2.Role.Doctor))
                revert InvalidDoctor();

            uint32 doctorId = identityRegistry.getIdentityId(doctor);
            uint64 key = _compositeKey(patientId, doctorId);

            uint256 packed = _consents[key];
            if (_isActive(packed)) revert ActiveConsentExists();

            uint32 nonce = uint32((packed & NONCE_MASK) >> NONCE_SHIFT) + 1;
            _consents[key] = _pack(expiresAt, nonce, scope);

            emit ConsentGranted(msg.sender, doctor, scope, nonce, issuedAt, expiresAt);
        }
    }

    function revokeConsentBatch(address[] calldata doctors, bytes32 revocationCode) external {
        if (doctors.length == 0) revert EmptyBatch();
        if (!identityRegistry.hasRole(msg.sender, IdentityRegistryV2.Role.Patient))
            revert InvalidPatient();

        uint32 patientId = identityRegistry.getIdentityId(msg.sender);
        uint64 revokedAt = uint64(block.timestamp);

        for (uint256 i = 0; i < doctors.length; i++) {
            uint32 doctorId = identityRegistry.getIdentityId(doctors[i]);
            uint64 key = _compositeKey(patientId, doctorId);

            uint256 packed = _consents[key];
            if (!_isActive(packed)) revert ConsentNotRevocable();

            uint32 nonce = uint32((packed & NONCE_MASK) >> NONCE_SHIFT);
            _consents[key] = uint256(nonce) << NONCE_SHIFT;

            emit ConsentRevoked(msg.sender, doctors[i], nonce, revocationCode, revokedAt);
        }
    }

    // ───────────────────── View functions ─────────────────────

    function hasValidConsent(
        address patient,
        address doctor,
        uint8   requiredScope
    ) external view returns (bool) {
        // Silently return false if either address is unregistered
        try identityRegistry.getIdentityId(patient) returns (uint32 patientId) {
            try identityRegistry.getIdentityId(doctor) returns (uint32 doctorId) {
                uint256 packed = _consents[_compositeKey(patientId, doctorId)];
                return _isActive(packed) && _coversScope(packed, requiredScope);
            } catch {
                return false;
            }
        } catch {
            return false;
        }
    }

    /// @dev Compatibility struct for read functions.
    struct ActiveConsentView {
        uint64  expiresAt;
        uint32  nonce;
        uint8   scope;
    }

    function getActiveConsent(
        address patient,
        address doctor
    ) external view returns (ActiveConsentView memory consent) {
        try identityRegistry.getIdentityId(patient) returns (uint32 patientId) {
            try identityRegistry.getIdentityId(doctor) returns (uint32 doctorId) {
                uint256 packed = _consents[_compositeKey(patientId, doctorId)];
                consent.expiresAt = uint64(packed & EXPIRES_MASK);
                consent.nonce     = uint32((packed & NONCE_MASK) >> NONCE_SHIFT);
                consent.scope     = uint8((packed & SCOPE_MASK) >> SCOPE_SHIFT);

                // Signal expired by zeroing expiresAt
                if (consent.expiresAt != 0 && consent.expiresAt <= uint64(block.timestamp)) {
                    consent.expiresAt = 0;
                    consent.scope = 0;
                }
            } catch { /* return zero struct */ }
        } catch { /* return zero struct */ }
    }

    // ───────────────────── Internal helpers ─────────────────────

    /// @dev Resolves two addresses to identity IDs and returns composite key.
    function _keyFor(address patient, address doctor) internal view returns (uint64) {
        uint32 patientId = identityRegistry.getIdentityId(patient);
        uint32 doctorId  = identityRegistry.getIdentityId(doctor);
        return _compositeKey(patientId, doctorId);
    }

    function _compositeKey(uint32 patientId, uint32 doctorId) internal pure returns (uint64) {
        return (uint64(patientId) << 32) | uint64(doctorId);
    }

    function _pack(uint64 expiresAt, uint32 nonce, uint8 scope) internal pure returns (uint256) {
        return uint256(expiresAt)
            | (uint256(nonce) << NONCE_SHIFT)
            | (uint256(scope) << SCOPE_SHIFT);
    }

    function _isActive(uint256 packed) internal view returns (bool) {
        uint64 expiresAt = uint64(packed & EXPIRES_MASK);
        uint8  scope     = uint8((packed & SCOPE_MASK) >> SCOPE_SHIFT);
        return expiresAt > uint64(block.timestamp) && scope != 0;
    }

    function _coversScope(uint256 packed, uint8 requiredScope) internal pure returns (bool) {
        uint8 granted = uint8((packed & SCOPE_MASK) >> SCOPE_SHIFT);
        return granted != 0 && (granted & requiredScope) == requiredScope;
    }

    function _isValidScope(uint8 scope) internal pure returns (bool) {
        return scope == SCOPE_VIEW || scope == SCOPE_UPLOAD || scope == SCOPE_FULL;
    }
}
