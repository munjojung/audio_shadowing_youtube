"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  createUploadCommand
} = require("../scripts/r2-upload-command");

async function withTestFile(content, callback) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "r2-upload-test-")
  );
  const file = path.join(dir, "sample.txt");

  try {
    fs.writeFileSync(file, content);
    await callback(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("Upload command contains correct SHA-256", async () => {
  await withTestFile("hello", async file => {
    const command = await createUploadCommand({
      bucket: "test-bucket",
      key: "contents/test/sample.mp3",
      file,
      contentType: "audio/mpeg"
    });

    try {
      const expected = crypto
        .createHash("sha256")
        .update("hello")
        .digest("hex");

      assert.equal(command.input.Metadata.sha256, expected);
      assert.equal(command.input.ContentLength, 5);
      assert.equal(command.input.ContentType, "audio/mpeg");
      assert.equal(command.input.Bucket, "test-bucket");
      assert.equal(
        command.input.Key,
        "contents/test/sample.mp3"
      );
    } finally {
      const stream = command.input.Body;

      if (!stream.closed) {
        await new Promise((resolve, reject) => {
          stream.once("close", resolve);
          stream.once("error", reject);
          stream.destroy();
        });
      }
    }
  });
});

test("Invalid upload parameters are rejected", async () => {
  await assert.rejects(
    createUploadCommand({
      bucket: "",
      key: "test",
      file: "test.mp3",
      contentType: "audio/mpeg"
    }),
    /Invalid upload parameters/
  );
});

test("Empty source file is rejected", async () => {
  await withTestFile("", async file => {
    await assert.rejects(
      createUploadCommand({
        bucket: "test-bucket",
        key: "test.mp3",
        file,
        contentType: "audio/mpeg"
      }),
      /non-empty file/
    );
  });
});
