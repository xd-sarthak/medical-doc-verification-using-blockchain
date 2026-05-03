import { ethers } from "ethers";

const PROFILE_KEY = "medvault-optimized-profiles-v1";
const RECORD_KEY = "medvault-optimized-records-v1";
const CONSENT_KEY = "medvault-optimized-consents-v1";

export const ROLE_ADMIN = 1;
export const ROLE_DOCTOR = 2;
export const ROLE_PATIENT = 3;

export const SCOPE_UPLOAD = 2;
export const CONSENT_DURATION_SECONDS = 30 * 24 * 60 * 60;

function safeParse(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "{}");
  } catch (error) {
    return {};
  }
}

function normalizeAddress(address) {
  return (address || "").toLowerCase();
}

function consentStorageKey(patient, doctor) {
  return `${normalizeAddress(patient)}:${normalizeAddress(doctor)}`;
}

export function shortenAddress(address) {
  if (!address) {
    return "";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getDisplayName(address, fallbackPrefix = "") {
  const profile = getProfile(address);
  if (profile?.displayName) {
    return profile.displayName;
  }

  const short = shortenAddress(address);
  return fallbackPrefix ? `${fallbackPrefix} ${short}` : short;
}

export function saveProfile(address, role, displayName) {
  const key = normalizeAddress(address);
  if (!key) {
    return;
  }

  const profiles = safeParse(PROFILE_KEY);
  profiles[key] = {
    address,
    role,
    displayName: displayName?.trim() || "",
  };
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
}

export function getProfile(address) {
  const profiles = safeParse(PROFILE_KEY);
  return profiles[normalizeAddress(address)] || null;
}

export function saveRecordMetadata(record) {
  const records = safeParse(RECORD_KEY);
  records[String(record.recordId)] = record;
  window.localStorage.setItem(RECORD_KEY, JSON.stringify(records));
}

export function getRecordMetadata(recordId) {
  const records = safeParse(RECORD_KEY);
  return records[String(recordId)] || null;
}

export function getRecordMetadataByHash(metadataHash) {
  const records = Object.values(safeParse(RECORD_KEY));
  return records.find((record) => record.metadataHash === metadataHash) || null;
}

export function saveConsentSecret(patient, doctor, secret, expiresAt) {
  const entries = safeParse(CONSENT_KEY);
  entries[consentStorageKey(patient, doctor)] = {
    patient,
    doctor,
    secret,
    expiresAt,
  };
  window.localStorage.setItem(CONSENT_KEY, JSON.stringify(entries));
}

export function getConsentSecret(patient, doctor) {
  const entry = safeParse(CONSENT_KEY)[consentStorageKey(patient, doctor)] || null;
  if (!entry) {
    return null;
  }

  if (entry.expiresAt && Date.now() / 1000 >= entry.expiresAt) {
    revokeConsentSecret(patient, doctor);
    return null;
  }

  return entry.secret;
}

export function revokeConsentSecret(patient, doctor) {
  const entries = safeParse(CONSENT_KEY);
  delete entries[consentStorageKey(patient, doctor)];
  window.localStorage.setItem(CONSENT_KEY, JSON.stringify(entries));
}

export function buildMetadataDigest(payload) {
  return ethers.solidityPackedKeccak256(
    ["address", "address", "string", "bytes32", "string", "string", "string", "string"],
    [
      payload.patient,
      payload.doctor,
      payload.documentCid,
      payload.documentHash,
      payload.fileName,
      payload.mimeType,
      payload.title,
      payload.description,
    ]
  );
}

export function verifyMetadataSignature(payload, signature, expectedDoctor) {
  const recovered = ethers.verifyMessage(ethers.getBytes(buildMetadataDigest(payload)), signature);
  return recovered.toLowerCase() === expectedDoctor.toLowerCase();
}

export async function uploadMetadataToIPFS(ipfsUploadFn, metadata) {
  const metadataCid = await ipfsUploadFn(metadata);
  return {
    metadataCid,
    metadataHash: ethers.id(metadataCid),
  };
}
