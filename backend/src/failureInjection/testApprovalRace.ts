import "dotenv/config";

import {
  connectMongo,
  disconnectMongo,
} from "../db/mongoClient";

import {
  EvaluationCaseModel,
} from "../db/models/EvaluationCase";

import {
  AuditRecordModel,
} from "../db/models/AuditRecord";

import {
  HumanApprovalService,
} from "../approval/humanApprovalService";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `FAIL: ${message}`
    );
  }

  console.log(
    `PASS: ${message}`
  );
}

async function main() {
  console.log(
    "\n=== DAY 7: APPROVAL RACE CONDITION INJECTION ==="
  );

  await connectMongo();

  const caseId =
    "DAY7-RACE-001";

  const decisionId =
    "DAY7-RACE-DECISION-001";

  try {
    /*
     * Clean only this dedicated test fixture.
     * The official eval-* experiment is untouched.
     */
    await EvaluationCaseModel.deleteOne({
      caseId,
    });

    await AuditRecordModel.deleteMany({
      decisionId,
    });

    /*
     * Create a case waiting for human approval.
     */
    await EvaluationCaseModel.create({
      caseId,

      declineCategory:
        "insufficient_funds",

      hardSoft:
        "soft",

      valueTier:
        "high",

      arpu:
        5000,

      amountAtRisk:
        5000,

      attemptNumber:
        1,

      retryHistory:
        [],

      historicalRecoverer:
        false,

      serialFailer:
        false,

      timeRemainingDays:
        2,

      state:
        "Awaiting Human Approval",

      fallback_active:
        false,
    });

    /*
     * Create the original decision audit.
     */
    await AuditRecordModel.create({
      eventId:
        `${decisionId}-created`,

      decisionId,

      caseId,

      inputSignals: {
        declineCategory:
          "insufficient_funds",

        valueTier:
          "high",

        retryCount:
          1,

        timeRemainingDays:
          2,

        amountAtRisk:
          5000,

        historicalRecoverer:
          false,

        serialFailer:
          false,
      },

      likelihoods: {
        escalate: {
          probability:
            0.80,

          confidence:
            0.90,
        },

        stop: {
          probability:
            0,

          confidence:
            1,
        },
      },

      evResults: {
        escalate:
          3500,

        stop:
          0,
      },

      chosenAction:
        "escalate",

      policyChecks: {
        permittedActions: [
          "escalate",
          "stop",
        ],

        escalationFlag:
          true,

        highValueFlag:
          true,
      },

      requiresHumanApproval:
        true,

      policyAuthorized:
        true,

      modelVersion:
        "phase5-v1",

      policyVersion:
        "phase5-v1",

      costModelVersion:
        "phase5-v1",

      resultingState:
        "Awaiting Human Approval",
    });

    const serviceA =
      new HumanApprovalService();

    const serviceB =
      new HumanApprovalService();

    /*
     * Two actors attempt to resolve the same
     * decision concurrently.
     */
    const [resultA, resultB] =
      await Promise.all([
        serviceA.resolve({
          decisionId,

          caseId,

          actorId:
            "revops-race-a",

          role:
            "RevOps",

          action:
            "approve",
        }),

        serviceB.resolve({
          decisionId,

          caseId,

          actorId:
            "revops-race-b",

          role:
            "RevOps",

          action:
            "approve",
        }),
      ]);

    const results = [
      resultA,
      resultB,
    ];

    const successes =
      results.filter(
        result =>
          result.success
      );

    const failures =
      results.filter(
        result =>
          !result.success
      );

    assert(
      successes.length === 1,
      "exactly one approval wins the race"
    );

    assert(
      failures.length === 1,
      "the competing approval is rejected"
    );

    assert(
      failures[0].reason.includes(
        "already resolved"
      ),
      "losing approval reports concurrent resolution"
    );

    /*
     * Verify only one final case state exists.
     */
    const finalCase =
      await EvaluationCaseModel
        .findOne({
          caseId,
        })
        .lean();

    assert(
      finalCase?.state ===
        "Escalated",
      "winning approval produces Escalated state"
    );

    /*
     * Exactly two audit records:
     * original decision + winning human action.
     */
    const auditRecords =
      await AuditRecordModel.find({
        decisionId,
      })
        .sort({
          timestamp: 1,
        })
        .lean();

    assert(
      auditRecords.length === 2,
      "only one human approval is audited"
    );

    console.log(
      `winning actor: ${
        successes[0].actorId
      }`
    );

    console.log(
      `final state: ${
        finalCase?.state
      }`
    );

    console.log(
      "\n=== APPROVAL RACE TEST: SUCCESS ==="
    );
  } finally {
    await EvaluationCaseModel.deleteOne({
      caseId,
    });

    await AuditRecordModel.deleteMany({
      decisionId,
    });

    await disconnectMongo();
  }
}

main().catch(
  async error => {
    console.error(
      "\nApproval race test failed:"
    );

    console.error(error);

    try {
      await disconnectMongo();
    } catch {}

    process.exit(1);
  }
);