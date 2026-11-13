"use strict";

const { verifyR2Metadata } = require("./r2-integrity");

const SLOTS = ["audio", "ko", "en"];

async function assessRecovery(state, localFiles) {
  if (!state || !["EMPTY", "PARTIAL", "COMPLETE"].includes(state.state)) {
    throw new Error("Invalid R2 state");
  }

  const expected = SLOTS.map(slot => state.objects?.[slot]?.exists);

  if (expected.some(value => typeof value !== "boolean")) {
    throw new Error("Incomplete R2 inspection");
  }

  const count = expected.filter(Boolean).length;
  const actualState = count === 0 ? "EMPTY" :
    count === 3 ? "COMPLETE" : "PARTIAL";

  if (state.state !== actualState) {
    throw new Error("Inconsistent R2 state");
  }

  const reusable = [];
  const missing = [];
  const blocked = [];

  for (const slot of SLOTS) {
    const file = localFiles?.[slot];

    if (typeof file !== "string" || !file.trim()) {
      throw new Error(`Missing local file: ${slot}`);
    }

    const remote = state.objects[slot];

    if (!remote.exists) {
      missing.push(slot);
      continue;
    }

    const result = await verifyR2Metadata(file, remote);

    if (result.verified) {
      reusable.push(slot);
    } else {
      blocked.push({
        slot,
        reason: result.reason
      });
    }
  }

  return {
    state: state.state,
    reusable,
    missing,
    blocked,
    metadataChecksPassed: blocked.length === 0,
    automaticRecoveryAllowed: false,
    requiresRemoteByteVerification: reusable.length > 0
  };
}

module.exports = { assessRecovery };
