import assert from "assert";

import {
  connectMongo,
  disconnectMongo,
} from "../db/mongoClient";

import {
  AuditRecordModel,
} from "../db/models/AuditRecord";

import {
  AuditService,
  CreateAuditInput,
} from "../audit/auditService";

class FailingAuditService
  extends AuditService {
  private failuresRemaining = 1;

  override async recordDecision(
    input: CreateAuditInput
  ) {
    if (
      this.failuresRemaining > 0
    ) {
      this.failuresRemaining--;

      throw new Error(
        "Injected audit write failure"
      );
    }

    return super.recordDecision(
      input
    );
  }
}

function assertPass(
  condition: boolean,
  message: string
): void {
  assert.ok(
    condition,
    `FAIL: ${message}`
  );

  console.log(
    `PASS: ${message}`
  );
}

async function main() {
  console.log(
    "\n=== DAY 7: AUDIT WRITE FAILURE INJECTION ==="
  );

  await connectMongo();

  try {
    const input: CreateAuditInput =
      {
        eventId:
          "day7-audit-failure-event-001",

        decisionId:
          "day7-audit-failure-decision-001",

        caseId:
          "day7-audit-failure-case-001",

        inputSignals: {
          declineCategory:
            "insufficient_funds",

          valueTier:
            "medium",

          retryCount: 1,

          timeRemainingDays: 2,

          amountAtRisk: 2000,

          historicalRecoverer:
            false,

          serialFailer:
            false,
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

        chosenAction:
          "retry_later",

        policyChecks: {
          permittedActions: [
            "retry_now",
            "retry_later",
            "notify_only",
            "escalate",
            "stop",
          ],

          highValue:
            false,

          lowConfidence:
            false,

          tie:
            false,
        },

        requiresHumanApproval:
          false,

        policyAuthorized:
          true,

        modelVersion:
          "phase5-v1",

        policyVersion:
          "phase5-v1",

        costModelVersion:
          "phase5-v1",

        resultingState:
          "Retry Scheduled",
      };

    await AuditRecordModel.deleteMany({
      decisionId:
        input.decisionId,
    });

    const failingService =
      new FailingAuditService();

    /*
     * First attempt:
     * injected storage failure.
     */
    let failed = false;

    try {
      await failingService.recordDecision(
        input
      );
    } catch {
      failed = true;
      console.log(
        "Injected failure observed."
      );
    }

    assertPass(
      failed,
      "injected audit write failure is detected"
    );

    /*
     * No audit record must exist after
     * the failed write.
     */
    const afterFailure =
      await AuditRecordModel.countDocuments({
        decisionId:
          input.decisionId,
      });

    assertPass(
      afterFailure === 0,
      "failed audit write leaves no partial audit record"
    );

    /*
     * Recovery attempt:
     * normal AuditService retries the write.
     */
    const normalService =
      new AuditService();

    const recovered =
      await normalService.recordDecision(
        input
      );

    assertPass(
      recovered.created === true,
      "audit write succeeds after failure recovery"
    );

    /*
     * Verify exactly one durable record.
     */
    const finalCount =
      await AuditRecordModel.countDocuments({
        decisionId:
          input.decisionId,
      });

    assertPass(
      finalCount === 1,
      "exactly one audit record is persisted"
    );

    /*
     * Verify duplicate retry is idempotent.
     */
    const duplicate =
      await normalService.recordDecision(
        input
      );

    assertPass(
      duplicate.created === false &&
        duplicate.duplicate === true,
      "replaying the recovered audit write is idempotent"
    );

    console.log(
      "\n=== AUDIT WRITE FAILURE TEST: SUCCESS ==="
    );
  } finally {
    await AuditRecordModel.deleteMany({
      decisionId:
        "day7-audit-failure-decision-001",
    });

    await disconnectMongo();
  }
}

main().catch(
  async (error) => {
    console.error(
      "\nAudit write failure test failed:"
    );

    console.error(error);

    try {
      await disconnectMongo();
    } catch {}

    process.exit(1);
  }
);