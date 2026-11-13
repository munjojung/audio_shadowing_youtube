"use strict";

const fs = require("node:fs");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { calculateSha256 } = require("./r2-integrity");

async function createUploadCommand({
  bucket,
  key,
  file,
  contentType
}) {
  if (
    typeof bucket !== "string" || !bucket.trim() ||
    typeof key !== "string" || !key.trim() ||
    typeof file !== "string" || !file.trim() ||
    typeof contentType !== "string" || !contentType.trim()
  ) {
    throw new Error("Invalid upload parameters");
  }

  const stat = await fs.promises.stat(file);

  if (!stat.isFile() || stat.size === 0) {
    throw new Error("Upload source must be a non-empty file");
  }

  const sha256 = await calculateSha256(file);

  return new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fs.createReadStream(file),
    ContentLength: stat.size,
    ContentType: contentType,
    Metadata: { sha256 }
  });
}

module.exports = { createUploadCommand };
