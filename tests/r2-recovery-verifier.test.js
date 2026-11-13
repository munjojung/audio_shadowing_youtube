"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { calculateSha256 } = require("../scripts/r2-integrity");
const {
  verifyRecoveryCandidates
} = require("../scripts/r2-recovery-verifier");

async function fixture(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "r2-verify-"));
  const localFiles = {};
  const objects = {};

  try {
    for (const slot of ["audio", "ko", "en"]) {
      const file = path.join(dir, `${slot}.txt`);
      fs.writeFileSync(file, `content-${slot}`);
      localFiles[slot] = file;

      objects[slot] = {
        exists: true,
        key: `contents/test/${slot}.txt`,
        size: fs.statSync(file).size,
        sha256: await calculateSha256(file)
      };
    }

    await callback(localFiles, objects);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("Verified existing objects become reuse candidates", async () => {
  await fixture(async (localFiles, objects) => {
    objects.en = { exists: false };

    const result = await verifyRecoveryCandidates({
      client: {},
      bucket: "test",
      state: { state: "PARTIAL", objects },
      localFiles,
      byteVerifier: async () => ({ verified: true })
    });

    assert.deepEqual(result.verified, ["audio", "ko"]);
    assert.deepEqual(result.missing, ["en"]);
    assert.deepEqual(result.blocked, []);
    assert.equal(result.readyForManualReview, true);
    assert.equal(result.automaticRecoveryAllowed, false);
  });
});

test("Remote byte mismatch blocks recovery", async () => {
  await fixture(async (localFiles, objects) => {
    objects.en = { exists: false };

    const result = await verifyRecoveryCandidates({
      client: {},
      bucket: "test",
      state: { state: "PARTIAL", objects },
      localFiles,
      byteVerifier: async () => ({ verified: false })
    });

    assert.equal(result.verified.length, 0);
    assert.equal(result.blocked.length, 2);
    assert.equal(result.readyForManualReview, false);
  });
});

test("Metadata mismatch skips remote byte verification", async () => {
  await fixture(async (localFiles, objects) => {
    objects.audio.sha256 = "0".repeat(64);
    objects.ko = { exists: false };
    objects.en = { exists: false };

    let calls = 0;

    const result = await verifyRecoveryCandidates({
      client: {},
      bucket: "test",
      state: { state: "PARTIAL", objects },
      localFiles,
      byteVerifier: async () => {
        calls++;
        return { verified: true };
      }
    });

    assert.equal(calls, 0);
    assert.equal(result.blocked[0].reason, "HASH_MISMATCH");
    assert.equal(result.readyForManualReview, false);
  });
});

test("Remote read error blocks recovery", async () => {
  await fixture(async (localFiles, objects) => {
    objects.en = { exists: false };

    const result = await verifyRecoveryCandidates({
      client: {},
      bucket: "test",
      state: { state: "PARTIAL", objects },
      localFiles,
      byteVerifier: async () => {
        throw new Error("R2 unavailable");
      }
    });

    assert.equal(result.blocked.length, 2);
    assert.equal(
      result.blocked[0].reason,
      "REMOTE_VERIFICATION_ERROR"
    );
    assert.equal(result.readyForManualReview, false);
  });
});
