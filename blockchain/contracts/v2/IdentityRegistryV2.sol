// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IdentityRegistryV2
 * @notice Gas-optimized identity and role registry using packed single-word storage.
 *
 * Storage layout per identity (1 slot = 256 bits):
 *   [0..7]    Role        (uint8)
 *   [8..15]   isActive    (uint8, 0 or 1)
 *   [16..55]  registeredAt(uint40)
 *   [56..87]  identityId  (uint32)
 *
 *   Total: 88 bits used per identity.  Remaining 168 bits are padding.
 *
 * This contract is non-upgradeable (no proxy overhead) for production use.
 */
contract IdentityRegistryV2 {
    // ───────────────────── Types ─────────────────────

    enum Role {
        None,      // 0
        Admin,     // 1
        Doctor,    // 2
        Patient,   // 3
        Auditor    // 4
    }

    /// @dev Compatibility struct returned by view functions.
    struct Identity {
        Role role;
        bool isActive;
        uint64 registeredAt;
        uint32 identityId;
    }

    // ───────────────────── Storage ─────────────────────

    /// @dev Packed identity word per address.
    mapping(address => uint256) internal _packed;

    /// @dev Reverse lookup: identityId → address.
    mapping(uint32 => address) public idToAddress;

    /// @dev Monotonic identity counter (starts at 1; 0 means unregistered).
    uint32 public nextIdentityId;

    /// @dev Contract owner (deployer / admin).
    address public owner;

    // ───────────────────── Events ─────────────────────

    event IdentityRegistered(address indexed account, uint8 indexed role, uint32 identityId, uint64 registeredAt);
    event IdentityStatusChanged(address indexed account, bool isActive, uint64 changedAt);
    event RoleUpdated(address indexed account, uint8 indexed oldRole, uint8 indexed newRole, uint64 changedAt);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ───────────────────── Errors ─────────────────────

    error InvalidAccount();
    error InvalidRole();
    error IdentityAlreadyExists();
    error IdentityNotFound();
    error StatusUnchanged();
    error NotOwner();
    error InvalidNewOwner();

    // ───────────────────── Packing constants ─────────────────────

    uint256 private constant ROLE_MASK       = 0xFF;                // bits [0..7]
    uint256 private constant ACTIVE_SHIFT    = 8;
    uint256 private constant ACTIVE_MASK     = 0xFF << ACTIVE_SHIFT; // bits [8..15]
    uint256 private constant TIMESTAMP_SHIFT = 16;
    uint256 private constant TIMESTAMP_MASK  = 0xFFFFFFFFFF << TIMESTAMP_SHIFT; // bits [16..55]
    uint256 private constant ID_SHIFT        = 56;
    uint256 private constant ID_MASK         = 0xFFFFFFFF << ID_SHIFT;          // bits [56..87]

    // ───────────────────── Modifiers ─────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ───────────────────── Constructor ─────────────────────

    constructor() {
        owner = msg.sender;

        uint32 adminId = 1;
        nextIdentityId = 2; // next available ID

        uint256 packed = _pack(Role.Admin, true, uint40(block.timestamp), adminId);
        _packed[msg.sender] = packed;
        idToAddress[adminId] = msg.sender;

        emit IdentityRegistered(msg.sender, uint8(Role.Admin), adminId, uint64(block.timestamp));
    }

    // ───────────────────── Admin writes ─────────────────────

    function registerIdentity(address account, Role role) external onlyOwner returns (uint32 identityId) {
        if (account == address(0)) revert InvalidAccount();
        if (role == Role.None) revert InvalidRole();
        if (_roleOf(_packed[account]) != Role.None) revert IdentityAlreadyExists();

        identityId = nextIdentityId++;
        uint40 ts = uint40(block.timestamp);

        _packed[account] = _pack(role, true, ts, identityId);
        idToAddress[identityId] = account;

        emit IdentityRegistered(account, uint8(role), identityId, uint64(ts));
    }

    function updateRole(address account, Role newRole) external onlyOwner {
        if (newRole == Role.None) revert InvalidRole();

        uint256 packed = _packed[account];
        Role oldRole = _roleOf(packed);
        if (oldRole == Role.None) revert IdentityNotFound();

        // Clear the role bits and write the new role
        packed = (packed & ~ROLE_MASK) | uint256(newRole);
        _packed[account] = packed;

        emit RoleUpdated(account, uint8(oldRole), uint8(newRole), uint64(block.timestamp));
    }

    function setIdentityStatus(address account, bool isActive) external onlyOwner {
        uint256 packed = _packed[account];
        if (_roleOf(packed) == Role.None) revert IdentityNotFound();

        bool currentActive = _isActiveOf(packed);
        if (currentActive == isActive) revert StatusUnchanged();

        // Clear active bit and set new value
        packed = (packed & ~ACTIVE_MASK) | (isActive ? (uint256(1) << ACTIVE_SHIFT) : 0);
        _packed[account] = packed;

        emit IdentityStatusChanged(account, isActive, uint64(block.timestamp));
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidNewOwner();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    // ───────────────────── View functions ─────────────────────

    function hasRole(address account, Role role) external view returns (bool) {
        uint256 packed = _packed[account];
        return _roleOf(packed) == role && _isActiveOf(packed);
    }

    function isActiveIdentity(address account) external view returns (bool) {
        uint256 packed = _packed[account];
        return _roleOf(packed) != Role.None && _isActiveOf(packed);
    }

    function getIdentity(address account) external view returns (Identity memory) {
        uint256 packed = _packed[account];
        if (_roleOf(packed) == Role.None) revert IdentityNotFound();
        return _unpack(packed);
    }

    function getIdentityId(address account) external view returns (uint32) {
        uint256 packed = _packed[account];
        if (_roleOf(packed) == Role.None) revert IdentityNotFound();
        return _idOf(packed);
    }

    function getAddressByIdentityId(uint32 id) external view returns (address) {
        address account = idToAddress[id];
        if (account == address(0)) revert IdentityNotFound();
        return account;
    }

    // ───────────────────── Internal helpers ─────────────────────

    function _pack(Role role, bool isActive, uint40 ts, uint32 id) internal pure returns (uint256) {
        return uint256(role)
            | (isActive ? (uint256(1) << ACTIVE_SHIFT) : 0)
            | (uint256(ts) << TIMESTAMP_SHIFT)
            | (uint256(id) << ID_SHIFT);
    }

    function _unpack(uint256 packed) internal pure returns (Identity memory identity) {
        identity.role = Role(packed & ROLE_MASK);
        identity.isActive = ((packed & ACTIVE_MASK) >> ACTIVE_SHIFT) == 1;
        identity.registeredAt = uint64((packed & TIMESTAMP_MASK) >> TIMESTAMP_SHIFT);
        identity.identityId = uint32((packed & ID_MASK) >> ID_SHIFT);
    }

    function _roleOf(uint256 packed) internal pure returns (Role) {
        return Role(packed & ROLE_MASK);
    }

    function _isActiveOf(uint256 packed) internal pure returns (bool) {
        return ((packed & ACTIVE_MASK) >> ACTIVE_SHIFT) == 1;
    }

    function _idOf(uint256 packed) internal pure returns (uint32) {
        return uint32((packed & ID_MASK) >> ID_SHIFT);
    }
}
