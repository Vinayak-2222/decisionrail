import assert from "assert";

import {
  DecisionRailPolicy,
} from "./DecisionRailPolicy";

import {
  CaseContext,
} from "../context/contextBuilder";

const policy = new DecisionRailPolicy();

const baseContext: CaseContext = {
  caseId: "policy-test-001",
  declineCategory: "insufficient_funds",
  hardSoft: "soft",
  valueTier: "medium",
  amountAtRisk: 2000,
  attemptNumber: 1,
  retryHistory: [],
  timeRemainingDays: 2,
  historicalRecoverer: false,
  serialFailer: false,
};

const confidenceByAction = {
  retry_now: 0.80,
  retry_later: 0.80,
  notify_only: 0.80,
  escalate: 0.80,
  stop: 1.00,
};

console.log("\n=== DAY 4: POLICY ENGINE TEST ===");

// 1. Normal case
const normal = policy.filterCandidates(baseContext);

assert.deepStrictEqual(normal.permittedActions, [
  "retry_now",
  "retry_later",
  "notify_only",
  "escalate",
  "stop",
]);

console.log("PASS: normal case");

// 2. Hard decline
const hardContext: CaseContext = {
  ...baseContext,
  declineCategory: "expired_blocked_card",
  hardSoft: "hard",
};

const hard = policy.filterCandidates(hardContext);

assert.deepStrictEqual(hard.permittedActions, ["stop"]);

console.log("PASS: hard decline -> stop");

// 3. Maximum retries
const retryLimitContext: CaseContext = {
  ...baseContext,
  attemptNumber: 3,
};

const retryLimited = policy.filterCandidates(
  retryLimitContext
);

assert(!retryLimited.permittedActions.includes("retry_now"));
assert(!retryLimited.permittedActions.includes("retry_later"));

console.log("PASS: max retries filters retry actions");

// 4. Contact cap
const contactCapContext: CaseContext = {
  ...baseContext,
  retryHistory: [
    { attemptNumber: 1, outcome: "failed" },
    { attemptNumber: 2, outcome: "failed" },
  ],
};

const contactLimited = policy.filterCandidates(
  contactCapContext
);

assert(!contactLimited.permittedActions.includes("notify_only"));

console.log("PASS: contact cap filters notify-only");

// 5. High-value gate
const highValueContext: CaseContext = {
  ...baseContext,
  valueTier: "high",
};

const highValueFiltered =
  policy.filterCandidates(highValueContext);

const highValue = policy.evaluateApprovalGates(
  highValueFiltered,
  highValueContext,
  "retry_now",
  confidenceByAction,
  false
);

assert.strictEqual(
  highValue.requiresHumanApproval,
  true
);

console.log("PASS: high-value -> human approval");

// 6. Low-confidence winning action
const lowConfidence = policy.evaluateApprovalGates(
  normal,
  baseContext,
  "retry_later",
  {
    ...confidenceByAction,
    retry_later: 0.40,
  },
  false
);

assert.strictEqual(
  lowConfidence.requiresHumanApproval,
  true
);

console.log("PASS: low confidence -> human approval");

// 7. Tie
const tie = policy.evaluateApprovalGates(
  normal,
  baseContext,
  "retry_now",
  confidenceByAction,
  true
);

assert.strictEqual(
  tie.requiresHumanApproval,
  true
);

console.log("PASS: tie -> human approval");

// 8. Policy must never restore filtered actions
assert.deepStrictEqual(
  hard.permittedActions,
  ["stop"]
);

console.log(
  "PASS: policy cannot re-add filtered actions"
);

console.log("\nStatus: SUCCESS");