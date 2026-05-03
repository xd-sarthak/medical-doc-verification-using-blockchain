function bytesToBase64(bytes) {
  let binary = "";
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function base64ToBytes(value) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importAesKey(secret) {
  return window.crypto.subtle.importKey(
    "raw",
    base64ToBytes(secret),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export function generateConsentSecret() {
  const secret = new Uint8Array(32);
  window.crypto.getRandomValues(secret);
  return bytesToBase64(secret);
}

export async function encryptBytes(data, secret) {
  const iv = new Uint8Array(12);
  window.crypto.getRandomValues(iv);
  const key = await importAesKey(secret);
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  return new Blob([iv, new Uint8Array(cipherBuffer)], {
    type: "application/octet-stream",
  });
}

export async function decryptBytes(payload, secret) {
  const source = payload instanceof ArrayBuffer ? payload : await payload.arrayBuffer();
  const iv = new Uint8Array(source.slice(0, 12));
  const ciphertext = source.slice(12);
  const key = await importAesKey(secret);
  const plainBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new Uint8Array(plainBuffer);
}

export async function encryptJson(data, secret) {
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  return encryptBytes(encoded, secret);
}

export async function decryptJson(payload, secret) {
  const decoded = await decryptBytes(payload, secret);
  return JSON.parse(new TextDecoder().decode(decoded));
}
