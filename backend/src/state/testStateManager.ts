import assert from "assert";
import { StateManager } from "./stateManager";

const manager = new StateManager();

console.log("\n=== DAY 4: STATE MANAGER TEST ===");

// At Risk -> Retry Scheduled
assert.strictEqual(
  manager.transition("At Risk", {
    type: "decision_computed",
    requiresHumanApproval: false,
    shouldStop: false,
  }),
  "Retry Scheduled"
);

console.log("PASS: At Risk -> Retry Scheduled");

// At Risk -> Human Approval
assert.strictEqual(
  manager.transition("At Risk", {
    type: "decision_computed",
    requiresHumanApproval: true,
    shouldStop: false,
  }),
  "Awaiting Human Approval"
);

console.log("PASS: At Risk -> Awaiting Human Approval");

// At Risk -> Stopped
assert.strictEqual(
  manager.transition("At Risk", {
    type: "decision_computed",
    requiresHumanApproval: false,
    shouldStop: true,
  }),
  "Stopped"
);

console.log("PASS: At Risk -> Stopped");

// Retry Scheduled -> Recovered
assert.strictEqual(
  manager.transition("Retry Scheduled", {
    type: "action_recovered",
  }),
  "Recovered"
);

console.log("PASS: Retry Scheduled -> Recovered");

// Retry Scheduled -> At Risk
assert.strictEqual(
  manager.transition("Retry Scheduled", {
    type: "action_failed",
    windowOpen: true,
  }),
  "At Risk"
);

console.log("PASS: Retry Scheduled -> At Risk");

// Awaiting Approval -> Escalated
assert.strictEqual(
  manager.transition("Awaiting Human Approval", {
    type: "human_approved",
    action: "escalate",
  }),
  "Escalated"
);

console.log("PASS: Approval -> Escalated");

// Awaiting Approval -> Stopped
assert.strictEqual(
  manager.transition("Awaiting Human Approval", {
    type: "human_stopped",
  }),
  "Stopped"
);

console.log("PASS: Approval -> Stopped");

// Terminal state must reject transition
assert.strictEqual(
  manager.canTransition("Recovered", {
    type: "window_expired",
  }),
  false
);

console.log("PASS: Recovered is terminal");

// Direct recovery from At Risk must be rejected
assert.strictEqual(
  manager.canTransition("At Risk", {
    type: "action_recovered",
  }),
  false
);

console.log("PASS: direct recovery rejected");

// Invalid transition must throw
assert.throws(() =>
  manager.transition("Stopped", {
    type: "human_stopped",
  })
);

console.log("PASS: invalid terminal transition rejected");

console.log("\nStatus: SUCCESS");