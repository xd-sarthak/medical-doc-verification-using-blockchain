// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract IdentityRegistry {
    enum Role {
        None,
        Admin,
        Doctor,
        Patient,
        Auditor
    }

    struct Identity {
        Role role;
        bool isActive;
        uint64 registeredAt;
    }

    address public immutable admin;
    mapping(address => Identity) public identities;

    event IdentityRegistered(address indexed account, uint8 indexed role, uint64 registeredAt);
    event IdentityStatusChanged(address indexed account, bool isActive, uint64 changedAt);
    event RoleUpdated(address indexed account, uint8 indexed oldRole, uint8 indexed newRole, uint64 changedAt);

    error NotAdmin();
    error InvalidAccount();
    error InvalidRole();
    error IdentityAlreadyExists();
    error IdentityNotFound();
    error StatusUnchanged();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor() {
        admin = msg.sender;
        identities[msg.sender] = Identity({
            role: Role.Admin,
            isActive: true,
            registeredAt: _timestamp()
        });

        emit IdentityRegistered(msg.sender, uint8(Role.Admin), _timestamp());
    }

    function registerIdentity(address account, Role role) external onlyAdmin {
        if (account == address(0)) revert InvalidAccount();
        if (role == Role.None) revert InvalidRole();
        if (identities[account].role != Role.None) revert IdentityAlreadyExists();

        uint64 registeredAt = _timestamp();
        identities[account] = Identity({
            role: role,
            isActive: true,
            registeredAt: registeredAt
        });

        emit IdentityRegistered(account, uint8(role), registeredAt);
    }

    function updateRole(address account, Role newRole) external onlyAdmin {
        if (newRole == Role.None) revert InvalidRole();

        Identity storage identity = identities[account];
        if (identity.role == Role.None) revert IdentityNotFound();

        Role oldRole = identity.role;
        identity.role = newRole;

        emit RoleUpdated(account, uint8(oldRole), uint8(newRole), _timestamp());
    }

    function setIdentityStatus(address account, bool isActive) external onlyAdmin {
        Identity storage identity = identities[account];
        if (identity.role == Role.None) revert IdentityNotFound();
        if (identity.isActive == isActive) revert StatusUnchanged();

        identity.isActive = isActive;
        emit IdentityStatusChanged(account, isActive, _timestamp());
    }

    function hasRole(address account, Role role) external view returns (bool) {
        Identity memory identity = identities[account];
        return identity.role == role && identity.isActive;
    }

    function isActiveIdentity(address account) external view returns (bool) {
        Identity memory identity = identities[account];
        return identity.role != Role.None && identity.isActive;
    }

    function getIdentity(address account) external view returns (Identity memory) {
        Identity memory identity = identities[account];
        if (identity.role == Role.None) revert IdentityNotFound();
        return identity;
    }

    function _timestamp() internal view returns (uint64) {
        return uint64(block.timestamp);
    }
}
