"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");

async function calculateSha256(filePath) {
  const hash = crypto.createHash("sha256");

  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

async function verifyR2Metadata(filePath, remoteObject) {
  if (!remoteObject || remoteObject.exists !== true) {
    return {
      verified: false,
      reason: "REMOTE_OBJECT_MISSING"
    };
  }

  const localSize = fs.statSync(filePath).size;
  const remoteSize = remoteObject.size;

  if (localSize !== remoteSize) {
    return {
      verified: false,
      reason: "SIZE_MISMATCH"
    };
  }

  const remoteHash = remoteObject.sha256;

  if (
    typeof remoteHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(remoteHash)
  ) {
    return {
      verified: false,
      reason: "REMOTE_HASH_UNAVAILABLE"
    };
  }

  const localHash = await calculateSha256(filePath);

  if (localHash.toLowerCase() !== remoteHash.toLowerCase()) {
    return {
      verified: false,
      reason: "HASH_MISMATCH"
    };
  }

  return {
    verified: true,
    reason: "MATCH",
    sha256: localHash
  };
}

module.exports = {
  calculateSha256,
  verifyR2Metadata
};
