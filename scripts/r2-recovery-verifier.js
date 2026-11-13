"use strict";

const { assessRecovery } = require("./r2-recovery-assessment");
const { verifyRemoteBytes } = require("./r2-byte-verifier");

const SLOTS = ["audio", "ko", "en"];

async function verifyRecoveryCandidates({
  client,
  bucket,
  state,
  localFiles,
  byteVerifier = verifyRemoteBytes
}) {
  const assessment = await assessRecovery(state, localFiles);

  const verified = [];
  const blocked = [...assessment.blocked];

  for (const slot of assessment.reusable) {
    const key = state.objects[slot].key;

    if (typeof key !== "string" || !key.trim()) {
      blocked.push({ slot, reason: "REMOTE_KEY_MISSING" });
      continue;
    }

    try {
      const result = await byteVerifier({
        client,
        bucket,
        key,
        localFile: localFiles[slot]
      });

      if (result.verified === true) {
        verified.push(slot);
      } else {
        blocked.push({
          slot,
          reason: "REMOTE_BYTES_MISMATCH"
        });
      }
    } catch (error) {
      blocked.push({
        slot,
        reason: "REMOTE_VERIFICATION_ERROR"
      });
    }
  }

  return {
    state: assessment.state,
    verified,
    missing: assessment.missing,
    blocked,
    readyForManualReview: blocked.length === 0,
    automaticRecoveryAllowed: false
  };
}

module.exports = { verifyRecoveryCandidates };
