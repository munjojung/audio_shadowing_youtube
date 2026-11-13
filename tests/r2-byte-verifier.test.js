"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { GetObjectCommand } = require("@aws-sdk/client-s3");

const {
  verifyRemoteBytes
} = require("../scripts/r2-byte-verifier");

async function withFile(callback) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "r2-byte-test-")
  );
  const file = path.join(dir, "sample.txt");

  try {
    fs.writeFileSync(file, "hello");
    await callback(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function mockClient(content) {
  return {
    async send(command) {
      assert.ok(command instanceof GetObjectCommand);
      return {
        Body: Readable.from([Buffer.from(content)])
      };
    }
  };
}

test("Matching remote bytes pass verification", async () => {
  await withFile(async localFile => {
    const result = await verifyRemoteBytes({
      client: mockClient("hello"),
      bucket: "test-bucket",
      key: "test.mp3",
      localFile
    });

    assert.equal(result.verified, true);
    assert.equal(result.bytesRead, 5);
    assert.equal(result.localHash, result.remoteHash);
  });
});

test("Different remote bytes fail verification", async () => {
  await withFile(async localFile => {
    const result = await verifyRemoteBytes({
      client: mockClient("world"),
      bucket: "test-bucket",
      key: "test.mp3",
      localFile
    });

    assert.equal(result.verified, false);
    assert.notEqual(result.localHash, result.remoteHash);
  });
});

test("R2 read errors are propagated", async () => {
  await withFile(async localFile => {
    const client = {
      async send() {
        throw new Error("R2 access denied");
      }
    };

    await assert.rejects(
      verifyRemoteBytes({
        client,
        bucket: "test-bucket",
        key: "test.mp3",
        localFile
      }),
      /R2 access denied/
    );
  });
});

test("Missing remote body is rejected", async () => {
  await withFile(async localFile => {
    const client = {
      async send() {
        return {};
      }
    };

    await assert.rejects(
      verifyRemoteBytes({
        client,
        bucket: "test-bucket",
        key: "test.mp3",
        localFile
      }),
      /not readable/
    );
  });
});
