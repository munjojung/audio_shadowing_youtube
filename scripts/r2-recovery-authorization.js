"use strict";

const SLOTS = ["audio", "ko", "en"];

function authorizeRecovery(result, confirmation) {
  if (!result || typeof result !== "object") {
    throw new Error("Invalid recovery verification result");
  }

  if (result.state !== "PARTIAL") {
    throw new Error("Recovery requires PARTIAL R2 state");
  }

  if (!Array.isArray(result.verified) ||
      !Array.isArray(result.missing) ||
      !Array.isArray(result.blocked)) {
    throw new Error("Incomplete recovery verification result");
  }

  if (result.blocked.length > 0 ||
      result.readyForManualReview !== true) {
    throw new Error("Recovery verification failed");
  }

  const combined = [...result.verified, ...result.missing];

  if (
    result.missing.length === 0 ||
    result.verified.length === 0 ||
    combined.length !== SLOTS.length ||
    new Set(combined).size !== SLOTS.length ||
    combined.some(slot => !SLOTS.includes(slot))
  ) {
    throw new Error("Invalid recovery object coverage");
  }

  if (confirmation !== "RECOVER_MISSING_ONLY") {
    throw new Error("Explicit recovery confirmation required");
  }

  return {
    authorized: true,
    uploadSlots: [...result.missing],
    preserveSlots: [...result.verified],
    overwriteAllowed: false,
    requiresPreUploadRecheck: true,
    requiresPostUploadVerification: true
  };
}

module.exports = { authorizeRecovery };
