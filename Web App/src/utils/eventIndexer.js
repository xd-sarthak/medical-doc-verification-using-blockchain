import { ethers } from "ethers";

/**
 * Lightweight client-side event indexer for V2 contracts.
 * Replaces the O(n) full-table-scan pattern with efficient event queries.
 */

/**
 * Fetch all records for a patient by querying RecordCreated events.
 * Returns record IDs filtered by patient address.
 */
export async function fetchRecordIdsForPatient(recordRegistry, patientAddress) {
  const filter = recordRegistry.filters.RecordCreated(null, null, patientAddress);
  const events = await recordRegistry.queryFilter(filter);
  return events.map((e) => ({
    recordId: Number(e.args.recordId),
    rootId: Number(e.args.rootId),
    doctor: e.args.doctor,
    documentHash: e.args.documentHash,
    metadataHash: e.args.metadataHash,
    createdAt: Number(e.args.createdAt),
  }));
}

/**
 * Fetch all records created by a specific doctor for a specific patient.
 */
export async function fetchRecordIdsForDoctorPatient(recordRegistry, patientAddress, doctorAddress) {
  const filter = recordRegistry.filters.RecordCreated(null, null, patientAddress);
  const events = await recordRegistry.queryFilter(filter);
  return events
    .filter((e) => e.args.doctor.toLowerCase() === doctorAddress.toLowerCase())
    .map((e) => ({
      recordId: Number(e.args.recordId),
      rootId: Number(e.args.rootId),
      doctor: e.args.doctor,
      documentHash: e.args.documentHash,
      metadataHash: e.args.metadataHash,
      createdAt: Number(e.args.createdAt),
    }));
}

/**
 * Fetch version history for a record lineage by querying RecordVersioned events.
 */
export async function fetchVersionHistory(recordRegistry, rootId) {
  const filter = recordRegistry.filters.RecordVersioned(null, null, rootId);
  const events = await recordRegistry.queryFilter(filter);
  return events.map((e) => ({
    oldRecordId: Number(e.args.oldRecordId),
    newRecordId: Number(e.args.newRecordId),
    rootId: Number(e.args.rootId),
    doctor: e.args.doctor,
    updatedAt: Number(e.args.updatedAt),
  }));
}

/**
 * Fetch consent history for a patient from ConsentGranted/ConsentRevoked events.
 */
export async function fetchConsentHistory(consentLedger, patientAddress) {
  const grantFilter = consentLedger.filters.ConsentGranted(patientAddress);
  const revokeFilter = consentLedger.filters.ConsentRevoked(patientAddress);

  const [grants, revokes] = await Promise.all([
    consentLedger.queryFilter(grantFilter),
    consentLedger.queryFilter(revokeFilter),
  ]);

  const history = [
    ...grants.map((e) => ({
      type: "grant",
      patient: e.args.patient,
      doctor: e.args.doctor,
      scope: Number(e.args.scope),
      nonce: Number(e.args.nonce),
      issuedAt: Number(e.args.issuedAt),
      expiresAt: Number(e.args.expiresAt),
      blockNumber: e.blockNumber,
    })),
    ...revokes.map((e) => ({
      type: "revoke",
      patient: e.args.patient,
      doctor: e.args.doctor,
      nonce: Number(e.args.nonce),
      revokedAt: Number(e.args.revokedAt),
      blockNumber: e.blockNumber,
    })),
  ];

  return history.sort((a, b) => a.blockNumber - b.blockNumber);
}
