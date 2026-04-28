import { create } from "ipfs-http-client";

const ipfs = create({
  url: "http://127.0.0.1:5001/api/v0",
});

export async function uploadFileToIPFS(file) {
  try {
    const content =
      typeof file === "string"
        ? file
        : file instanceof Blob
          ? file
          : file.stream();

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

export async function fetchIpfsBlob(cid) {
  const response = await fetch(`http://127.0.0.1:8080/ipfs/${cid}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch IPFS payload for ${cid}`);
  }
  return response.blob();
}
