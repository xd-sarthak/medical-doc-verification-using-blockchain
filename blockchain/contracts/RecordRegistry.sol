// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ConsentLedger.sol";
import "./IdentityRegistry.sol";

contract RecordRegistry {
    enum RecordStatus {
        None,
        Active,
        Superseded,
        Revoked
    }

    struct Record {
        bytes32 documentHash;
        bytes32 metadataHash;
        address patient;
        address doctor;
        uint64 parentId;
        uint64 rootId;
        uint40 createdAt;
        uint40 updatedAt;
        RecordStatus status;
    }

    IdentityRegistry public immutable identityRegistry;
    ConsentLedger public immutable consentLedger;
    address public immutable admin;
    uint64 public nextRecordId;

    mapping(uint64 => Record) public records;

    event RecordCreated(
        uint64 indexed recordId,
        uint64 indexed rootId,
        address indexed patient,
        address doctor,
        bytes32 documentHash,
        bytes32 metadataHash,
        uint40 createdAt
    );

    event RecordVersioned(
        uint64 indexed oldRecordId,
        uint64 indexed newRecordId,
        uint64 indexed rootId,
        address doctor,
        bytes32 newDocumentHash,
        bytes32 newMetadataHash,
        uint40 updatedAt
    );

    event RecordRevoked(
        uint64 indexed recordId,
        uint64 indexed rootId,
        address indexed patient,
        address actor,
        bytes32 revocationCode,
        uint40 revokedAt
    );

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

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor(address registryAddress, address consentLedgerAddress) {
        if (registryAddress == address(0)) revert InvalidRegistry();
        if (consentLedgerAddress == address(0)) revert InvalidConsentLedger();

        identityRegistry = IdentityRegistry(registryAddress);
        consentLedger = ConsentLedger(consentLedgerAddress);
        admin = msg.sender;
    }

    function createRecord(
        address patient,
        bytes32 documentHash,
        bytes32 metadataHash
    ) external returns (uint64 recordId) {
        if (!identityRegistry.hasRole(patient, IdentityRegistry.Role.Patient)) revert InvalidPatient();
        if (!identityRegistry.hasRole(msg.sender, IdentityRegistry.Role.Doctor)) revert InvalidDoctor();
        if (documentHash == bytes32(0)) revert InvalidDocumentHash();
        if (metadataHash == bytes32(0)) revert InvalidMetadataHash();
        if (!consentLedger.hasValidConsent(patient, msg.sender, consentLedger.SCOPE_UPLOAD())) {
            revert ConsentRequired();
        }

        recordId = ++nextRecordId;
        uint40 createdAt = _timestamp();

        records[recordId] = Record({
            documentHash: documentHash,
            metadataHash: metadataHash,
            patient: patient,
            doctor: msg.sender,
            parentId: 0,
            rootId: recordId,
            createdAt: createdAt,
            updatedAt: createdAt,
            status: RecordStatus.Active
        });

        emit RecordCreated(recordId, recordId, patient, msg.sender, documentHash, metadataHash, createdAt);
    }

    function updateRecord(
        uint64 oldRecordId,
        bytes32 newDocumentHash,
        bytes32 newMetadataHash
    ) external returns (uint64 newRecordId) {
        if (!identityRegistry.hasRole(msg.sender, IdentityRegistry.Role.Doctor)) revert InvalidDoctor();
        if (newDocumentHash == bytes32(0)) revert InvalidDocumentHash();
        if (newMetadataHash == bytes32(0)) revert InvalidMetadataHash();

        Record storage oldRecord = records[oldRecordId];
        if (!_exists(oldRecord)) revert InvalidRecord();
        if (oldRecord.status != RecordStatus.Active) revert RecordNotActive();
        if (oldRecord.doctor != msg.sender) revert RecordAuthorMismatch();
        if (!consentLedger.hasValidConsent(oldRecord.patient, msg.sender, consentLedger.SCOPE_UPLOAD())) {
            revert ConsentRequired();
        }

        uint40 updatedAt = _timestamp();
        uint64 rootId = oldRecord.rootId;

        oldRecord.status = RecordStatus.Superseded;
        oldRecord.updatedAt = updatedAt;

        newRecordId = ++nextRecordId;
        records[newRecordId] = Record({
            documentHash: newDocumentHash,
            metadataHash: newMetadataHash,
            patient: oldRecord.patient,
            doctor: msg.sender,
            parentId: oldRecordId,
            rootId: rootId,
            createdAt: updatedAt,
            updatedAt: updatedAt,
            status: RecordStatus.Active
        });

        emit RecordVersioned(
            oldRecordId,
            newRecordId,
            rootId,
            msg.sender,
            newDocumentHash,
            newMetadataHash,
            updatedAt
        );
    }

    function revokeRecord(uint64 recordId, bytes32 revocationCode) external {
        Record storage record = records[recordId];
        if (!_exists(record)) revert InvalidRecord();
        if (record.status != RecordStatus.Active) revert RecordNotActive();
        if (msg.sender != record.patient && msg.sender != admin) revert Unauthorized();

        uint40 revokedAt = _timestamp();
        record.status = RecordStatus.Revoked;
        record.updatedAt = revokedAt;

        emit RecordRevoked(recordId, record.rootId, record.patient, msg.sender, revocationCode, revokedAt);
    }

    function getRecord(uint64 recordId) external view returns (Record memory) {
        Record memory record = records[recordId];
        if (!_exists(record)) revert InvalidRecord();
        return record;
    }

    function _exists(Record memory record) internal pure returns (bool) {
        return record.patient != address(0);
    }

    function _timestamp() internal view returns (uint40) {
        return uint40(block.timestamp);
    }
}
