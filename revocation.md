# Consent Revocation Flow

## Overview

Patients revoke doctor access through the optimized `ConsentLedger` contract. Revocation removes future write authorization without deleting existing records.

## Flow

1. Patient signs in with the same wallet address they enter in the web app.
2. Patient clicks `Revoke` for a doctor with active consent.
3. The frontend calls `ConsentLedger.revokeConsent(doctor, revocationCode)`.
4. The contract deletes the active consent entry and emits `ConsentRevoked`.
5. The frontend deletes the local consent secret for that patient-doctor pair.
6. Encrypted records already written remain on IPFS and on-chain, but new writes are blocked.

## Contracts Involved

- `IdentityRegistry`: validates that the actor is an active patient or doctor.
- `ConsentLedger`: stores and revokes active consent with scope and expiry.
- `RecordRegistry`: rejects future writes when consent is no longer valid.

## Security Notes

- Revocation is enforced at the smart-contract layer, not just in the UI.
- The local consent secret is removed on revoke so encrypted file viewing is no longer available from that browser session.
- Existing record integrity remains verifiable because the record hashes and events are still on-chain.
