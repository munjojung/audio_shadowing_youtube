"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  authorizeRecovery
} = require("../scripts/r2-recovery-authorization");

function validResult() {
  return {
    state: "PARTIAL",
    verified: ["audio", "ko"],
    missing: ["en"],
    blocked: [],
    readyForManualReview: true,
    automaticRecoveryAllowed: false
  };
}

test("Explicit confirmation authorizes missing-only plan", () => {
  const result = authorizeRecovery(
    validResult(),
    "RECOVER_MISSING_ONLY"
  );

  assert.equal(result.authorized, true);
  assert.deepEqual(result.uploadSlots, ["en"]);
  assert.deepEqual(result.preserveSlots, ["audio", "ko"]);
  assert.equal(result.overwriteAllowed, false);
  assert.equal(result.requiresPreUploadRecheck, true);
});

test("Missing confirmation blocks recovery", () => {
  assert.throws(
    () => authorizeRecovery(validResult(), ""),
    /Explicit recovery confirmation required/
  );
});

test("Blocked objects prevent recovery", () => {
  const result = validResult();
  result.blocked = [{ slot: "audio", reason: "HASH_MISMATCH" }];
  result.readyForManualReview = false;

  assert.throws(
    () => authorizeRecovery(result, "RECOVER_MISSING_ONLY"),
    /Recovery verification failed/
  );
});

test("Complete R2 state cannot use partial recovery", () => {
  const result = validResult();
  result.state = "COMPLETE";

  assert.throws(
    () => authorizeRecovery(result, "RECOVER_MISSING_ONLY"),
    /PARTIAL R2 state/
  );
});

test("Duplicate or incomplete slot coverage is rejected", () => {
  const result = validResult();
  result.verified = ["audio", "audio"];

  assert.throws(
    () => authorizeRecovery(result, "RECOVER_MISSING_ONLY"),
    /Invalid recovery object coverage/
  );
});
