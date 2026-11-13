"use strict";

const SLOTS = ["audio", "ko", "en"];

function createRecoveryPlan(state) {
  if (!state || !["EMPTY", "PARTIAL", "COMPLETE"].includes(state.state)) {
    throw new Error("Invalid R2 state");
  }

  const existing = SLOTS.filter(
    slot => state.objects?.[slot]?.exists === true
  );

  const missing = SLOTS.filter(
    slot => state.objects?.[slot]?.exists === false
  );

  if (existing.length + missing.length !== SLOTS.length) {
    throw new Error("Incomplete R2 inspection");
  }

  const expectedState =
    existing.length === 0 ? "EMPTY" :
    existing.length === 3 ? "COMPLETE" : "PARTIAL";

  if (state.state !== expectedState) {
    throw new Error("Inconsistent R2 state");
  }

  return {
    state: state.state,
    existing,
    missing,
    requiresVerification: existing.length > 0,
    automaticRecoveryAllowed: false,
    message:
      state.state === "EMPTY"
        ? "No existing objects. New registration may proceed."
        : state.state === "PARTIAL"
          ? "Partial upload detected. Verify existing objects before recovery."
          : "All objects exist. Verify integrity and catalog before recovery."
  };
}

module.exports = { createRecoveryPlan };
