"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRecoveryPlan
} = require("../scripts/r2-recovery-plan");

function makeState(slots) {
  const names = ["audio", "ko", "en"];
  const count = slots.length;

  return {
    state: count === 0 ? "EMPTY" :
           count === 3 ? "COMPLETE" : "PARTIAL",
    objects: Object.fromEntries(
      names.map(name => [
        name,
        { exists: slots.includes(name) }
      ])
    )
  };
}

test("Empty R2 state creates new registration plan", () => {
  const plan = createRecoveryPlan(makeState([]));

  assert.equal(plan.state, "EMPTY");
  assert.deepEqual(plan.missing, ["audio", "ko", "en"]);
  assert.equal(plan.automaticRecoveryAllowed, false);
});

test("Partial R2 state identifies missing files", () => {
  const plan = createRecoveryPlan(
    makeState(["audio", "ko"])
  );

  assert.equal(plan.state, "PARTIAL");
  assert.deepEqual(plan.existing, ["audio", "ko"]);
  assert.deepEqual(plan.missing, ["en"]);
  assert.equal(plan.requiresVerification, true);
});

test("Complete R2 state requires verification", () => {
  const plan = createRecoveryPlan(
    makeState(["audio", "ko", "en"])
  );

  assert.equal(plan.state, "COMPLETE");
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.requiresVerification, true);
});

test("Invalid state is rejected", () => {
  assert.throws(
    () => createRecoveryPlan({ state: "UNKNOWN" }),
    /Invalid R2 state/
  );
});

test("Inconsistent state is rejected", () => {
  const state = makeState(["audio"]);
  state.state = "COMPLETE";

  assert.throws(
    () => createRecoveryPlan(state),
    /Inconsistent R2 state/
  );
});
