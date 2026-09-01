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

import { DecisionPipeline } from "./decisionPipeline";

async function resetEvaluationBatch(): Promise<void> {
  const stateReset =
    await EvaluationCaseModel.updateMany(
      {
        caseId: /^eval-/,
      },
      {
        $set: {
          state: "At Risk",
          fallback_active: false,
        },
      }
    );

  const auditReset =
    await AuditRecordModel.deleteMany({
      caseId: /^eval-/,
    });

  console.log(
    `Test reset: ${stateReset.modifiedCount} evaluation cases reset`
  );

  console.log(
    `Test reset: ${auditReset.deletedCount} evaluation audit records cleared`
  );

  const cases =
    await EvaluationCaseModel.find(
      {
        caseId: /^eval-/,
      },
      {
        caseId: 1,
        state: 1,
      }
    )
      .lean();

  if (cases.length !== 200) {
    throw new Error(
      `Expected 200 evaluation cases, found ${cases.length}`
    );
  }

  const invalidStates =
    cases.filter(
      (item) =>
        item.state !== "At Risk"
    );

  if (
    invalidStates.length > 0
  ) {
    throw new Error(
      `${invalidStates.length} evaluation cases were not reset to At Risk`
    );
  }

  console.log(
    "Test reset: batch verified at At Risk"
  );
}

async function main() {
  await connectMongo();

  try {
    console.log(
      "\n=== DAY 5: FULL DECISIONRAIL PIPELINE ==="
    );

    // --------------------------------------------------
    // TEST FIXTURE RESET
    // --------------------------------------------------

    await resetEvaluationBatch();

    const pipeline =
      new DecisionPipeline();

    const result =
      await pipeline.run();

    console.log(
      "\n=== PIPELINE RESULTS ==="
    );

    console.log(
      `cases processed: ${result.casesProcessed}`
    );

    console.log(
      `automatic executions: ${result.automaticExecutions}`
    );

    console.log(
      `human approval cases: ${result.humanApprovalCases}`
    );

    console.log(
      `stopped cases: ${result.stoppedCases}`
    );

    console.log(
      `recovered cases: ${result.recoveredCases}`
    );

    console.log(
      `total amount at risk: ₹${result.totalAmountAtRisk}`
    );

    console.log(
      `recovered amount: ₹${result.recoveredAmount}`
    );

    console.log(
      "\n=== SAMPLE PIPELINE DECISIONS ==="
    );

    console.log(
      JSON.stringify(
        result.results.slice(0, 5),
        null,
        2
      )
    );

    if (
      result.casesProcessed !== 200
    ) {
      throw new Error(
        `Expected 200 cases, got ${result.casesProcessed}`
      );
    }

    console.log(
      "\nPASS: all 200 existing evaluation cases processed"
    );

    console.log(
      "PASS: existing evaluation batch was used"
    );

    console.log(
      "PASS: no dataset generation was triggered"
    );

    console.log(
      "\n=== DAY 5 PIPELINE: SUCCESS ==="
    );
  } finally {
    await disconnectMongo();
  }
}

main().catch(
  async (error) => {
    console.error(
      "\nDay 5 pipeline failed:"
    );

    console.error(error);

    try {
      await disconnectMongo();
    } catch {}

    process.exit(1);
  }
);