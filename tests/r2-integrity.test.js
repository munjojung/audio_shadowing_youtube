"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  calculateSha256,
  verifyR2Metadata
} = require("../scripts/r2-integrity");

test("SHA-256 calculation is correct", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "r2-hash-test-")
  );

  try {
    const file = path.join(dir, "test.txt");
    fs.writeFileSync(file, "hello");

    const expected = crypto
      .createHash("sha256")
      .update("hello")
      .digest("hex");

    assert.equal(await calculateSha256(file), expected);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Matching R2 metadata is accepted", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "r2-hash-test-")
  );

  try {
    const file = path.join(dir, "test.txt");
    fs.writeFileSync(file, "hello");

    const sha256 = await calculateSha256(file);

    const result = await verifyR2Metadata(file, {
      exists: true,
      size: 5,
      sha256
    });

    assert.equal(result.verified, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Size mismatch is rejected", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "r2-hash-test-")
  );

  try {
    const file = path.join(dir, "test.txt");
    fs.writeFileSync(file, "hello");

    const result = await verifyR2Metadata(file, {
      exists: true,
      size: 999,
      sha256: "a".repeat(64)
    });

    assert.equal(result.reason, "SIZE_MISMATCH");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Missing hash metadata is rejected", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "r2-hash-test-")
  );

  try {
    const file = path.join(dir, "test.txt");
    fs.writeFileSync(file, "hello");

    const result = await verifyR2Metadata(file, {
      exists: true,
      size: 5
    });

    assert.equal(result.reason, "REMOTE_HASH_UNAVAILABLE");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Hash mismatch is rejected", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "r2-hash-test-")
  );

  try {
    const file = path.join(dir, "test.txt");
    fs.writeFileSync(file, "hello");

    const result = await verifyR2Metadata(file, {
      exists: true,
      size: 5,
      sha256: "0".repeat(64)
    });

    assert.equal(result.reason, "HASH_MISMATCH");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
