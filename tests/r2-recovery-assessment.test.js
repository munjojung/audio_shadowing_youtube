"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { calculateSha256 } = require("../scripts/r2-integrity");
const { assessRecovery } = require("../scripts/r2-recovery-assessment");

async function withFiles(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "r2-recovery-"));
  const files = {};

  try {
    for (const slot of ["audio", "ko", "en"]) {
      files[slot] = path.join(dir, `${slot}.txt`);
      fs.writeFileSync(files[slot], `content-${slot}`);
    }

    const objects = {};

    for (const slot of ["audio", "ko", "en"]) {
      objects[slot] = {
        exists: true,
        size: fs.statSync(files[slot]).size,
        sha256: await calculateSha256(files[slot])
      };
    }

    await callback(files, objects);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("Partial recovery identifies reusable and missing files", async () => {
  await withFiles(async (files, objects) => {
    objects.en = { exists: false };

    const result = await assessRecovery({
      state: "PARTIAL",
      objects
    }, files);

    assert.deepEqual(result.reusable, ["audio", "ko"]);
    assert.deepEqual(result.missing, ["en"]);
    assert.deepEqual(result.blocked, []);
    assert.equal(result.automaticRecoveryAllowed, false);
    assert.equal(result.requiresRemoteByteVerification, true);
  });
});

test("Mismatched SHA-256 blocks reuse", async () => {
  await withFiles(async (files, objects) => {
    objects.audio.sha256 = "0".repeat(64);
    objects.en = { exists: false };

    const result = await assessRecovery({
      state: "PARTIAL",
      objects
    }, files);

    assert.equal(result.blocked[0].slot, "audio");
    assert.equal(result.blocked[0].reason, "HASH_MISMATCH");
    assert.equal(result.metadataChecksPassed, false);
  });
});

test("Missing remote hash blocks reuse", async () => {
  await withFiles(async (files, objects) => {
    delete objects.ko.sha256;

    const result = await assessRecovery({
      state: "COMPLETE",
      objects
    }, files);

    assert.equal(result.blocked[0].slot, "ko");
    assert.equal(result.blocked[0].reason, "REMOTE_HASH_UNAVAILABLE");
  });
});

test("Empty R2 state marks all files as missing", async () => {
  await withFiles(async (files, objects) => {
    for (const slot of ["audio", "ko", "en"]) {
      objects[slot] = { exists: false };
    }

    const result = await assessRecovery({
      state: "EMPTY",
      objects
    }, files);

    assert.deepEqual(result.missing, ["audio", "ko", "en"]);
    assert.deepEqual(result.reusable, []);
    assert.deepEqual(result.blocked, []);
    assert.equal(result.automaticRecoveryAllowed, false);
  });
});

test("Inconsistent R2 state is rejected", async () => {
  await withFiles(async (files, objects) => {
    objects.en = { exists: false };

    await assert.rejects(
      assessRecovery({
        state: "COMPLETE",
        objects
      }, files),
      /Inconsistent R2 state/
    );
  });
});
