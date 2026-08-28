import assert from "assert";

import { connectMongo, disconnectMongo } from "../db/mongoClient";
import { AuditService } from "./auditService";
import { AuditRecordModel } from "../db/models/AuditRecord";

async function main() {
  await connectMongo();

  try {
    console.log("\n=== DAY 4: AUDIT SERVICE TEST ===");

    const auditService = new AuditService();

    const input = {
      eventId: "event-day4-001",
      decisionId: "decision-day4-001",
      caseId: "case-day4-001",

      inputSignals: {
        declineCategory: "insufficient_funds",
        valueTier: "medium",
        retryCount: 1,
        timeRemainingDays: 2,
        amountAtRisk: 2000,
        historicalRecoverer: false,
        serialFailer: false,
      },

      likelihoods: {
        retry_now: {
          probability: 0.60,
          confidence: 0.80,
        },
        retry_later: {
          probability: 0.70,
          confidence: 0.80,
        },
        notify_only: {
          probability: 0.35,
          confidence: 0.80,
        },
        escalate: {
          probability: 0.50,
          confidence: 0.80,
        },
        stop: {
          probability: 0,
          confidence: 1,
        },
      },

      evResults: {
        retry_now: 1198,
        retry_later: 1398,
        notify_only: 695,
        escalate: 960,
        stop: 0,
      },

      chosenAction: "retry_later",

      policyChecks: {
        permittedActions: [
          "retry_now",
          "retry_later",
          "notify_only",
          "escalate",
          "stop",
        ],
        highValue: false,
        lowConfidence: false,
        tie: false,
      },

      requiresHumanApproval: false,
      policyAuthorized: true,

      modelVersion: "phase5-v1",
      policyVersion: "phase5-v1",
      costModelVersion: "phase5-v1",

      executionResult: {
        executed: true,
        simulatedFailure: false,
      },

      resultingState: "Retry Scheduled",
    };

    // Clean up this specific test record first,
    // so the test is repeatable.
    await AuditRecordModel.deleteMany({
      decisionId: input.decisionId,
      eventId: input.eventId,
    });

    // First write
    const first = await auditService.recordDecision(input);

    assert.strictEqual(first.created, true);
    assert.strictEqual(first.duplicate, false);

    console.log("PASS: first audit record created");

    // Verify it exists in MongoDB
    const stored = await AuditRecordModel.findOne({
      decisionId: input.decisionId,
      eventId: input.eventId,
    }).lean();

    assert(stored !== null);

    console.log("PASS: audit record persisted in MongoDB");

    // Duplicate write
    const second = await auditService.recordDecision(input);

    assert.strictEqual(second.created, false);
    assert.strictEqual(second.duplicate, true);

    console.log("PASS: duplicate decision is ignored");

    // Ensure only one record exists
    const count = await AuditRecordModel.countDocuments({
      decisionId: input.decisionId,
      eventId: input.eventId,
    });

    assert.strictEqual(count, 1);

    console.log("PASS: exactly one audit record exists");

    console.log("\n=== STORED AUDIT RECORD ===");
    console.log(
      JSON.stringify(stored, null, 2)
    );

    console.log("\nStatus: SUCCESS");
  } finally {
    await disconnectMongo();
  }
}

main().catch(async (error) => {
  console.error("\nAudit test failed:");
  console.error(error);

  try {
    await disconnectMongo();
  } catch {}

  process.exit(1);
});