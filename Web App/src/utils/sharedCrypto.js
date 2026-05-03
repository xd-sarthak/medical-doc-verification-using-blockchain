import { fetchIpfsBlob } from "../ipfs";
import { decryptBytes } from "./crypto";

/**
 * Decrypts and opens an encrypted medical document from IPFS.
 * Shared between doctor and patient dashboards.
 */
export async function openEncryptedDocument(documentCid, mimeType, fileName, secret, password) {
  const blob = await fetchIpfsBlob(documentCid, password);
  const plainBytes = await decryptBytes(blob, secret);
  const fileBlob = new Blob([plainBytes], { type: mimeType || "application/octet-stream" });
  const url = window.URL.createObjectURL(fileBlob);
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.download = fileName || "medical-record";
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
