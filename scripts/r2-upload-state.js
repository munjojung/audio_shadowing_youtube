"use strict";

const {
  HeadObjectCommand
} = require("@aws-sdk/client-s3");

const SLOTS = ["audio", "ko", "en"];

function buildObjectKeys(id, base) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id) ||
      !/^[A-Za-z0-9_-]{1,150}$/.test(base) ||
      !base.endsWith("_" + id)) {
    throw new Error("Invalid content identity");
  }

  const prefix = `contents/${id}/${base}`;

  return {
    audio: `${prefix}.mp3`,
    ko: `${prefix}_ko.vtt`,
    en: `${prefix}_en.vtt`
  };
}

async function inspectR2Objects(client, bucket, keys) {
  const objects = {};

  for (const slot of SLOTS) {
    const key = keys[slot];

    try {
      const result = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key
        })
      );

      objects[slot] = {
        exists: true,
        key,
        size: result.ContentLength ?? null,
        etag: result.ETag ?? null,
        sha256: result.Metadata?.sha256 ?? null
      };
    } catch (error) {
      if (
        error.name === "NotFound" ||
        error.name === "NoSuchKey" ||
        error.$metadata?.httpStatusCode === 404
      ) {
        objects[slot] = {
          exists: false,
          key
        };
      } else {
        throw error;
      }
    }
  }

  const existing = SLOTS.filter(
    slot => objects[slot].exists
  );

  let state = "EMPTY";

  if (existing.length === 3) {
    state = "COMPLETE";
  } else if (existing.length > 0) {
    state = "PARTIAL";
  }

  return {
    state,
    existing,
    missing: SLOTS.filter(
      slot => !objects[slot].exists
    ),
    objects
  };
}

function assertNewRegistrationAllowed(result) {
  if (result.state === "EMPTY") {
    return true;
  }

  if (result.state === "PARTIAL") {
    throw new Error(
      "PARTIAL_R2_UPLOAD: Existing objects: " +
      result.existing.join(", ") +
      ". Manual recovery required."
    );
  }

  throw new Error(
    "R2_OBJECTS_ALREADY_EXIST: Refusing overwrite."
  );
}

module.exports = {
  buildObjectKeys,
  inspectR2Objects,
  assertNewRegistrationAllowed
};
