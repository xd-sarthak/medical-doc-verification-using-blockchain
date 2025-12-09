import { create } from "ipfs-http-client";

const ipfs = create({
  url: "http://127.0.0.1:5001/api/v0",
});

export async function uploadFileToIPFS(file) {
    console.log(">>> USING NEW UPLOAD FUNCTION", file);

  try {
    // Browser File -> ReadableStream (best for IPFS)
    const stream = file.stream();

    const result = await ipfs.add(stream, {
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

export const viewFile = async (cid) => {
  const url = `http://127.0.0.1:8080/ipfs/${cid}`;
  window.open(url, "_blank");
};
