import { BaselinePolicy } from "./BaselinePolicy";
import { CaseContext } from "../context/contextBuilder";

const policy = new BaselinePolicy();

const baseContext: CaseContext = {
  caseId: "test-0001",
  declineCategory: "insufficient_funds",
  hardSoft: "soft",
  valueTier: "medium",
  amountAtRisk: 1624,
  attemptNumber: 1,
  retryHistory: [],
  timeRemainingDays: 3,
  historicalRecoverer: false,
  serialFailer: false,
};

console.log(
  "attempt 1:",
  policy.decide(baseContext)
);

console.log(
  "attempt 2:",
  policy.decide({
    ...baseContext,
    attemptNumber: 2,
  })
);

console.log(
  "attempt 3:",
  policy.decide({
    ...baseContext,
    attemptNumber: 3,
  })
);

console.log(
  "no time remaining:",
  policy.decide({
    ...baseContext,
    attemptNumber: 2,
    timeRemainingDays: 0,
  })
);