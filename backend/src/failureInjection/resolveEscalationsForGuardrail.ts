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
    throw new Error(`FAIL: ${message}`);
  }

  console.log(`PASS: ${message}`);
}

async function main() {
  console.log(
    "\n=== DAY 7: RESOLVE ESCALATIONS FOR GUARDRAIL TEST ==="
  );

  await connectMongo();

  try {
    const decisionRecords =
      await AuditRecordModel.find({
        caseId: /^eval-/,
        eventId: /-created$/,
        chosenAction: "escalate",
        requiresHumanApproval: true,
      })
        .sort({
          caseId: 1,
        })
        .lean();

    assert(
      decisionRecords.length === 48,
      `48 escalation decisions found (found ${decisionRecords.length})`
    );

    const approvalService =
      new HumanApprovalService();

    let resolved = 0;
    let alreadyResolved = 0;

    for (const decision of decisionRecords) {
      const evaluationCase =
        await EvaluationCaseModel.findOne({
          caseId: decision.caseId,
        }).lean();

      if (
        !evaluationCase ||
        evaluationCase.state !==
          "Awaiting Human Approval"
      ) {
        alreadyResolved++;
        continue;
      }

      const result =
        await approvalService.resolve({
          decisionId:
            decision.decisionId,

          caseId:
            decision.caseId,

          actorId:
            "guardrail-reviewer",

          role:
            "Admin",

          action:
            "approve",
        });

      if (result.success) {
        resolved++;
      } else {
        throw new Error(
          `Failed to resolve ${decision.caseId}: ${result.reason}`
        );
      }
    }

    const remaining =
      await EvaluationCaseModel.countDocuments({
        caseId:
          {
            $in:
              decisionRecords.map(
                record => record.caseId
              ),
          },

        state:
          "Awaiting Human Approval",
      });

    console.log(
      `resolved now: ${resolved}`
    );

    console.log(
      `already resolved: ${alreadyResolved}`
    );

    console.log(
      `remaining escalation cases: ${remaining}`
    );

    assert(
      remaining === 0,
      "all DecisionRail escalation decisions have human resolutions"
    );

    const humanAudits =
      await AuditRecordModel.countDocuments({
        caseId: /^eval-/,
        eventId: /-human-/,
      });

    console.log(
      `total evaluation human-resolution audits: ${humanAudits}`
    );

    console.log(
      "\n=== ESCALATION RESOLUTION TEST: SUCCESS ==="
    );
  } finally {
    await disconnectMongo();
  }
}

main().catch(
  async error => {
    console.error(
      "\nEscalation resolution test failed:"
    );

    console.error(error);

    try {
      await disconnectMongo();
    } catch {}

    process.exit(1);
  }
);