import { create } from "ipfs-http-client";

const IPFS_API = process.env.REACT_APP_IPFS_API || "http://127.0.0.1:5001/api/v0";
const IPFS_GATEWAY = process.env.REACT_APP_IPFS_GATEWAY || "http://127.0.0.1:8080/ipfs";

const ipfs = create({
  url: IPFS_API,
});

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function uploadFileToIPFS(file, password) {
  try {
    let content =
      typeof file === "string"
        ? new TextEncoder().encode(file)
        : file instanceof Blob
          ? await file.arrayBuffer()
          : await new Response(file).arrayBuffer();

    if (password) {
      console.log("Encrypting file before upload...");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(password, salt);
      
      const encryptedContent = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        content
      );

      // Combine salt, iv, and encrypted data for storage
      const combined = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encryptedContent), salt.length + iv.length);
      content = combined;
    }

    const result = await ipfs.add(content, {
      pin: true,
      wrapWithDirectory: false,
    });

    const cid = result.cid.toString();
    console.log("Uploaded CID:", cid);
    return cid;
  } catch (err) {
    console.error("IPFS Upload Error:", err);
    throw err;
  }
}

export async function fetchIpfsBlob(cid, password) {
  const response = await fetch(`${IPFS_GATEWAY}/${cid}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch IPFS payload for ${cid}`);
  }
  
  const data = await response.arrayBuffer();
  
  if (password) {
    console.log("Decrypting file after fetch...");
    const salt = data.slice(0, 16);
    const iv = data.slice(16, 28);
    const encryptedData = data.slice(28);
    
    const key = await deriveKey(password, new Uint8Array(salt));
    try {
      const decryptedData = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        key,
        encryptedData
      );
      return new Blob([decryptedData]);
    } catch (err) {
      console.error("Decryption failed:", err);
      throw new Error("Failed to decrypt document. Incorrect password?");
    }
  }

  return new Blob([data]);
}
