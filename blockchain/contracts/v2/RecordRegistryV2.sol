// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IdentityRegistryV2.sol";
import "./ConsentLedgerV2.sol";

/**
 * @title RecordRegistryV2
 * @notice Gas-optimized medical record registry using 3-slot packed storage.
 *
 * Storage layout per record:
 *   Slot 0: bytes32 metadataHash
 *   Slot 1: bytes32 documentHash
 *   Slot 2: packed node word:
 *           [patientId(32) | doctorId(32) | parentId(64) | rootId(64) | status(8) | _reserved(56)]
 *           = 200 bits used
 *
 * Design decisions:
 *   - createdAt / updatedAt removed from storage → emitted in events only.
 *   - Head pointer mapping: activeRecordByRootId[rootId] → latest active recordId.
 *   - On update: mark old as Superseded (1 warm SSTORE), write new node (3 cold SSTOREs),
 *     update head pointer (1 warm SSTORE).
 *   - Non-upgradeable for production deployment.
 */
contract RecordRegistryV2 {
    // ───────────────────── Types ─────────────────────

    enum RecordStatus {
        None,       // 0
        Active,     // 1
        Superseded, // 2
        Revoked     // 3
    }

    /// @dev Compatibility struct for view functions.
    struct Record {
        bytes32      documentHash;
        bytes32      metadataHash;
        address      patient;
        address      doctor;
        uint64       parentId;
        uint64       rootId;
        uint64       recordId;
        RecordStatus status;
    }

    // ───────────────────── Storage ─────────────────────

    IdentityRegistryV2 public immutable identityRegistry;
    ConsentLedgerV2    public immutable consentLedger;

    uint64 public nextRecordId;

    /// @dev Slot 0 per record: metadata hash.
    mapping(uint64 => bytes32) internal _metadataHashes;

    /// @dev Slot 1 per record: document hash.
    mapping(uint64 => bytes32) internal _documentHashes;

    /// @dev Slot 2 per record: packed node word.
    mapping(uint64 => uint256) internal _nodes;

    /// @dev Head pointer: rootId → latest active recordId.
    mapping(uint64 => uint64) public activeRecordByRootId;

    address public owner;

    // ───────────────────── Events ─────────────────────

    event RecordCreated(
        uint64  indexed recordId,
        uint64  indexed rootId,
        address indexed patient,
        address doctor,
        bytes32 documentHash,
        bytes32 metadataHash,
        uint40  createdAt
    );

    event RecordVersioned(
        uint64  indexed oldRecordId,
        uint64  indexed newRecordId,
        uint64  indexed rootId,
        address doctor,
        bytes32 newDocumentHash,
        bytes32 newMetadataHash,
        uint40  updatedAt
    );

    event RecordRevoked(
        uint64  indexed recordId,
        uint64  indexed rootId,
        address indexed patient,
        address actor,
        bytes32 revocationCode,
        uint40  revokedAt
    );

    // ───────────────────── Errors ─────────────────────

    error InvalidRegistry();
    error InvalidConsentLedger();
    error InvalidPatient();
    error InvalidDoctor();
    error InvalidDocumentHash();
    error InvalidMetadataHash();
    error InvalidRecord();
    error Unauthorized();
    error ConsentRequired();
    error RecordNotActive();
    error RecordAuthorMismatch();
    error NotOwner();

    // ───────────────────── Packed node layout ─────────────────────
    //
    // Bits [0..31]     patientId   (uint32)
    // Bits [32..63]    doctorId    (uint32)
    // Bits [64..127]   parentId    (uint64)
    // Bits [128..191]  rootId      (uint64)
    // Bits [192..199]  status      (uint8)
    //

    uint256 private constant PATIENT_MASK   = 0xFFFFFFFF;
    uint256 private constant DOCTOR_SHIFT   = 32;
    uint256 private constant DOCTOR_MASK    = uint256(0xFFFFFFFF) << DOCTOR_SHIFT;
    uint256 private constant PARENT_SHIFT   = 64;
    uint256 private constant PARENT_MASK    = uint256(0xFFFFFFFFFFFFFFFF) << PARENT_SHIFT;
    uint256 private constant ROOT_SHIFT     = 128;
    uint256 private constant ROOT_MASK      = uint256(0xFFFFFFFFFFFFFFFF) << ROOT_SHIFT;
    uint256 private constant STATUS_SHIFT   = 192;
    uint256 private constant STATUS_MASK    = uint256(0xFF) << STATUS_SHIFT;

    // ───────────────────── Modifiers ─────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ───────────────────── Constructor ─────────────────────

    constructor(address registryAddress, address consentLedgerAddress) {
        if (registryAddress == address(0)) revert InvalidRegistry();
        if (consentLedgerAddress == address(0)) revert InvalidConsentLedger();

        identityRegistry = IdentityRegistryV2(registryAddress);
        consentLedger = ConsentLedgerV2(consentLedgerAddress);
        owner = msg.sender;
        nextRecordId = 1;
    }

    // ───────────────────── Write: create ─────────────────────

    function createRecord(
        address patient,
        bytes32 documentHash,
        bytes32 metadataHash
    ) external returns (uint64 recordId) {
        if (!identityRegistry.hasRole(patient, IdentityRegistryV2.Role.Patient))
            revert InvalidPatient();
        if (!identityRegistry.hasRole(msg.sender, IdentityRegistryV2.Role.Doctor))
            revert InvalidDoctor();
        if (documentHash == bytes32(0)) revert InvalidDocumentHash();
        if (metadataHash == bytes32(0)) revert InvalidMetadataHash();
        if (!consentLedger.hasValidConsent(patient, msg.sender, consentLedger.SCOPE_UPLOAD()))
            revert ConsentRequired();

        recordId = nextRecordId++;
        uint32 patientId = identityRegistry.getIdentityId(patient);
        uint32 doctorId  = identityRegistry.getIdentityId(msg.sender);
        uint40 createdAt = uint40(block.timestamp);

        // Write 3 slots
        _metadataHashes[recordId] = metadataHash;
        _documentHashes[recordId] = documentHash;
        _nodes[recordId] = _packNode(patientId, doctorId, 0, recordId, RecordStatus.Active);

        // Set head pointer (rootId = recordId for new records)
        activeRecordByRootId[recordId] = recordId;

        emit RecordCreated(recordId, recordId, patient, msg.sender, documentHash, metadataHash, createdAt);
    }

    // ───────────────────── Write: update (version) ─────────────────────

    function updateRecord(
        uint64  oldRecordId,
        bytes32 newDocumentHash,
        bytes32 newMetadataHash
    ) external returns (uint64 newRecordId) {
        if (!identityRegistry.hasRole(msg.sender, IdentityRegistryV2.Role.Doctor))
            revert InvalidDoctor();
        if (newDocumentHash == bytes32(0)) revert InvalidDocumentHash();
        if (newMetadataHash == bytes32(0)) revert InvalidMetadataHash();

        uint256 oldNode = _nodes[oldRecordId];
        if (_statusOf(oldNode) == RecordStatus.None) revert InvalidRecord();
        if (_statusOf(oldNode) != RecordStatus.Active) revert RecordNotActive();

        uint32 doctorId = _doctorIdOf(oldNode);
        uint32 callerDoctorId = identityRegistry.getIdentityId(msg.sender);
        if (doctorId != callerDoctorId) revert RecordAuthorMismatch();

        uint32 patientId = _patientIdOf(oldNode);
        address patient = identityRegistry.getAddressByIdentityId(patientId);
        if (!consentLedger.hasValidConsent(patient, msg.sender, consentLedger.SCOPE_UPLOAD()))
            revert ConsentRequired();

        uint64 rootId = _rootIdOf(oldNode);
        uint40 updatedAt = uint40(block.timestamp);

        // Mark old record as Superseded (warm SSTORE — only status byte changes)
        _nodes[oldRecordId] = (oldNode & ~STATUS_MASK) | (uint256(RecordStatus.Superseded) << STATUS_SHIFT);

        // Write new record (3 cold SSTOREs)
        newRecordId = nextRecordId++;
        _metadataHashes[newRecordId] = newMetadataHash;
        _documentHashes[newRecordId] = newDocumentHash;
        _nodes[newRecordId] = _packNode(patientId, callerDoctorId, oldRecordId, rootId, RecordStatus.Active);

        // Update head pointer (warm SSTORE)
        activeRecordByRootId[rootId] = newRecordId;

        emit RecordVersioned(oldRecordId, newRecordId, rootId, msg.sender, newDocumentHash, newMetadataHash, updatedAt);
    }

    // ───────────────────── Write: revoke ─────────────────────

    function revokeRecord(uint64 recordId, bytes32 revocationCode) external {
        uint256 node = _nodes[recordId];
        if (_statusOf(node) == RecordStatus.None) revert InvalidRecord();
        if (_statusOf(node) != RecordStatus.Active) revert RecordNotActive();

        uint32 patientId = _patientIdOf(node);
        address patient = identityRegistry.getAddressByIdentityId(patientId);

        if (msg.sender != patient && msg.sender != owner) revert Unauthorized();

        uint40 revokedAt = uint40(block.timestamp);
        uint64 rootId = _rootIdOf(node);

        // Mark as revoked (warm SSTORE)
        _nodes[recordId] = (node & ~STATUS_MASK) | (uint256(RecordStatus.Revoked) << STATUS_SHIFT);

        // Clear head pointer
        activeRecordByRootId[rootId] = 0;

        emit RecordRevoked(recordId, rootId, patient, msg.sender, revocationCode, revokedAt);
    }

    // ───────────────────── View functions ─────────────────────

    function getRecord(uint64 recordId) external view returns (Record memory record) {
        uint256 node = _nodes[recordId];
        if (_statusOf(node) == RecordStatus.None) revert InvalidRecord();

        uint32 patientId = _patientIdOf(node);
        uint32 doctorId  = _doctorIdOf(node);

        record.documentHash = _documentHashes[recordId];
        record.metadataHash = _metadataHashes[recordId];
        record.patient      = identityRegistry.getAddressByIdentityId(patientId);
        record.doctor       = identityRegistry.getAddressByIdentityId(doctorId);
        record.parentId     = _parentIdOf(node);
        record.rootId       = _rootIdOf(node);
        record.recordId     = recordId;
        record.status       = _statusOf(node);
    }

    function getActiveRecordId(uint64 rootId) external view returns (uint64) {
        return activeRecordByRootId[rootId];
    }

    function isActiveRecord(uint64 recordId) external view returns (bool) {
        return _statusOf(_nodes[recordId]) == RecordStatus.Active;
    }

    // ───────────────────── Internal helpers ─────────────────────

    function _packNode(
        uint32       patientId,
        uint32       doctorId,
        uint64       parentId,
        uint64       rootId,
        RecordStatus status
    ) internal pure returns (uint256) {
        return uint256(patientId)
            | (uint256(doctorId) << DOCTOR_SHIFT)
            | (uint256(parentId) << PARENT_SHIFT)
            | (uint256(rootId) << ROOT_SHIFT)
            | (uint256(status) << STATUS_SHIFT);
    }

    function _patientIdOf(uint256 node) internal pure returns (uint32) {
        return uint32(node & PATIENT_MASK);
    }

    function _doctorIdOf(uint256 node) internal pure returns (uint32) {
        return uint32((node & DOCTOR_MASK) >> DOCTOR_SHIFT);
    }

    function _parentIdOf(uint256 node) internal pure returns (uint64) {
        return uint64((node & PARENT_MASK) >> PARENT_SHIFT);
    }

    function _rootIdOf(uint256 node) internal pure returns (uint64) {
        return uint64((node & ROOT_MASK) >> ROOT_SHIFT);
    }

    function _statusOf(uint256 node) internal pure returns (RecordStatus) {
        return RecordStatus(uint8((node & STATUS_MASK) >> STATUS_SHIFT));
    }
}
