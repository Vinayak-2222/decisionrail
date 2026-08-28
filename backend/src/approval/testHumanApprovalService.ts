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
} from "./humanApprovalService";

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
  await connectMongo();

  const caseId =
    "DAY5-APPROVAL-001";

  const decisionId =
    "DAY5-APPROVAL-DECISION-001";

  try {
    console.log(
      "\n=== DAY 5: HUMAN APPROVAL TEST ==="
    );

    // --------------------------------------------------
    // CLEAN THIS TEST FIXTURE
    //
    // This does NOT touch the real eval- batch.
    // It only removes records belonging to this
    // dedicated test case/decision.
    // --------------------------------------------------

    await EvaluationCaseModel.deleteOne({
      caseId,
    });

    await AuditRecordModel.deleteMany({
      decisionId,
    });

    // --------------------------------------------------
    // CREATE CASE WAITING FOR HUMAN APPROVAL
    // --------------------------------------------------

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

    // --------------------------------------------------
    // ORIGINAL DECISION AUDIT
    // --------------------------------------------------

    const auditService =
      new (
        require(
          "../audit/auditService"
        ).AuditService
      )();

    await auditService.recordDecision({
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
        retry_now: {
          probability:
            0.70,

          confidence:
            0.90,
        },

        retry_later: {
          probability:
            0.65,

          confidence:
            0.90,
        },

        notify_only: {
          probability:
            0.40,

          confidence:
            0.90,
        },

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
        retry_now:
          3000,

        retry_later:
          2800,

        notify_only:
          1500,

        escalate:
          3500,

        stop:
          0,
      },

      chosenAction:
        "escalate",

      policyChecks: {
        permittedActions: [
          "retry_now",
          "retry_later",
          "notify_only",
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

    console.log(
      "PASS: approval decision created"
    );

    // --------------------------------------------------
    // HUMAN APPROVAL
    // --------------------------------------------------

    const approvalService =
      new HumanApprovalService();

    const approveResult =
      await approvalService.resolve({
        decisionId,

        caseId,

        actorId:
          "revops-user-001",

        role:
          "RevOps",

        action:
          "approve",
      });

    assert(
      approveResult.success === true,
      "approval succeeds"
    );

    assert(
      approveResult.resultingState ===
        "Escalated",
      "approved escalation -> Escalated"
    );

    // --------------------------------------------------
    // PERSISTED STATE
    // --------------------------------------------------

    const approvedCase =
      await EvaluationCaseModel
        .findOne({
          caseId,
        })
        .lean();

    assert(
      approvedCase?.state ===
        "Escalated",
      "approved state persisted"
    );

    // --------------------------------------------------
    // DUPLICATE / SECOND APPROVAL
    // --------------------------------------------------

    const duplicateApproval =
      await approvalService.resolve({
        decisionId,

        caseId,

        actorId:
          "revops-user-002",

        role:
          "RevOps",

        action:
          "approve",
      });

    assert(
      duplicateApproval.success ===
        false,
      "second approval is rejected"
    );

    // --------------------------------------------------
    // AUDIT HISTORY
    // --------------------------------------------------

    const auditRecords =
      await AuditRecordModel.find({
        decisionId,
        caseId,
      })
        .sort({
          timestamp: 1,
        })
        .lean();

    assert(
      auditRecords.length === 2,
      "exactly two audit events exist"
    );

    const originalAudit =
      auditRecords.find(
        (record) =>
          record.eventId ===
          `${decisionId}-created`
      );

    const humanAudit =
      auditRecords.find(
        (record) =>
          record.eventId ===
          `${decisionId}-human-approve`
      );

    assert(
      Boolean(originalAudit),
      "original decision audit exists"
    );

    assert(
      Boolean(humanAudit),
      "human approval audit exists"
    );

    // --------------------------------------------------
    // HUMAN AUDIT CONTENT
    // --------------------------------------------------

    assert(
      humanAudit?.policyChecks?.humanAction ===
        "approve",
      "human action is audited"
    );

    assert(
      humanAudit?.policyChecks?.humanResolution ===
        "approve",
      "human resolution is audited"
    );

    assert(
      humanAudit?.policyChecks?.actorId ===
        "revops-user-001",
      "approver identity is audited"
    );

    assert(
      humanAudit?.policyChecks?.role ===
        "RevOps",
      "approver role is audited"
    );

    assert(
      humanAudit?.policyChecks?.originalAction ===
        "escalate",
      "original action is audited"
    );

    assert(
      humanAudit?.resultingState ===
        "Escalated",
      "human audit contains resulting state"
    );

    console.log(
      "\n=== HUMAN APPROVAL TEST: SUCCESS ==="
    );
  } finally {
    /*
     * Test cleanup only.
     *
     * Never touches the official eval-* experiment.
     */
    await EvaluationCaseModel.deleteOne({
      caseId,
    });

    await AuditRecordModel.deleteMany({
      decisionId,
    });

    await disconnectMongo();
  }
}

main().catch(async (error) => {
  console.error(
    "\nHuman Approval test failed:"
  );

  console.error(error);

  try {
    await disconnectMongo();
  } catch {}

  process.exit(1);
});