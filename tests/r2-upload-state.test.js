"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildObjectKeys,
  inspectR2Objects,
  assertNewRegistrationAllowed
} = require("../scripts/r2-upload-state");

const ID = "tsSHK7o5FbE";
const BASE = "lesson_" + ID;

function mockClient(existingSlots) {
  return {
    async send(command) {
      const key = command.input.Key;

      const slot = key.endsWith("_ko.vtt")
        ? "ko"
        : key.endsWith("_en.vtt")
          ? "en"
          : "audio";

      if (existingSlots.includes(slot)) {
        return {
          ContentLength: 100,
          ETag: '"test"'
        };
      }

      const error = new Error("Not found");
      error.name = "NotFound";
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    }
  };
}

test("Build correct R2 keys", () => {
  const keys = buildObjectKeys(ID, BASE);

  assert.equal(
    keys.audio,
    `contents/${ID}/${BASE}.mp3`
  );

  assert.equal(
    keys.ko,
    `contents/${ID}/${BASE}_ko.vtt`
  );

  assert.equal(
    keys.en,
    `contents/${ID}/${BASE}_en.vtt`
  );
});

test("Empty R2 state allows registration", async () => {
  const keys = buildObjectKeys(ID, BASE);
  const result = await inspectR2Objects(
    mockClient([]), "test-bucket", keys
  );

  assert.equal(result.state, "EMPTY");
  assert.equal(assertNewRegistrationAllowed(result), true);
});

test("Partial R2 state blocks registration", async () => {
  const keys = buildObjectKeys(ID, BASE);
  const result = await inspectR2Objects(
    mockClient(["audio"]), "test-bucket", keys
  );

  assert.equal(result.state, "PARTIAL");

  assert.throws(
    () => assertNewRegistrationAllowed(result),
    /PARTIAL_R2_UPLOAD/
  );
});

test("Complete R2 state blocks overwrite", async () => {
  const keys = buildObjectKeys(ID, BASE);
  const result = await inspectR2Objects(
    mockClient(["audio", "ko", "en"]),
    "test-bucket",
    keys
  );

  assert.equal(result.state, "COMPLETE");

  assert.throws(
    () => assertNewRegistrationAllowed(result),
    /R2_OBJECTS_ALREADY_EXIST/
  );
});

test("R2 permission error is propagated", async () => {
  const client = {
    async send() {
      const error = new Error("Access denied");
      error.name = "AccessDenied";
      error.$metadata = { httpStatusCode: 403 };
      throw error;
    }
  };

  await assert.rejects(
    () => inspectR2Objects(
      client,
      "test-bucket",
      buildObjectKeys(ID, BASE)
    ),
    /Access denied/
  );
});

test("R2 SHA-256 metadata is read correctly", async () => {
  const hash = "a".repeat(64);

  const client = {
    async send() {
      return {
        ContentLength: 123,
        ETag: '"test"',
        Metadata: {
          sha256: hash
        }
      };
    }
  };

  const result = await inspectR2Objects(
    client,
    "test-bucket",
    buildObjectKeys(ID, BASE)
  );

  assert.equal(result.state, "COMPLETE");
  assert.equal(result.objects.audio.sha256, hash);
  assert.equal(result.objects.ko.sha256, hash);
  assert.equal(result.objects.en.sha256, hash);
});
