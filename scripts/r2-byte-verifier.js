"use strict";

const crypto = require("node:crypto");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { calculateSha256 } = require("./r2-integrity");

async function verifyRemoteBytes({
  client,
  bucket,
  key,
  localFile
}) {
  if (!client || typeof client.send !== "function" ||
      typeof bucket !== "string" || !bucket.trim() ||
      typeof key !== "string" || !key.trim() ||
      typeof localFile !== "string" || !localFile.trim()) {
    throw new Error("Invalid verification parameters");
  }

  const localHash = await calculateSha256(localFile);

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key
    })
  );

  if (!response.Body ||
      typeof response.Body[Symbol.asyncIterator] !== "function") {
    throw new Error("R2 object body is not readable");
  }

  const hash = crypto.createHash("sha256");
  let bytesRead = 0;

  try {
    for await (const chunk of response.Body) {
      hash.update(chunk);
      bytesRead += chunk.length;
    }
  } finally {
    response.Body.destroy?.();
  }

  const remoteHash = hash.digest("hex");

  return {
    verified: localHash === remoteHash,
    localHash,
    remoteHash,
    bytesRead
  };
}

module.exports = { verifyRemoteBytes };
