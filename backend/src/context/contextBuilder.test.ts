import { buildCaseContext } from "./contextBuilder";

const sampleCase = {
  caseId: "test-0001",
  declineCategory: "insufficient_funds" as const,
  hardSoft: "soft" as const,
  valueTier: "medium" as const,
  arpu: 1698,
  amountAtRisk: 1624,
  attemptNumber: 2 as const,
  retryHistory: [
    {
      attemptNumber: 1,
      outcome: "failed" as const,
    },
  ],
  historicalRecoverer: false,
  serialFailer: false,
  timeRemainingDays: 2,
};

const context = buildCaseContext(sampleCase);

console.log(JSON.stringify(context, null, 2));