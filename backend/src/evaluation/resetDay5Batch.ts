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

async function main() {
  await connectMongo();

  try {
    console.log(
      "\n=== DAY 5: RESET EXISTING EVALUATION BATCH ==="
    );

    // --------------------------------------------------
    // IMPORTANT:
    // Only reset lifecycle state on the EXISTING
    // 200 evaluation cases.
    //
    // No features are regenerated.
    // Hidden PotentialOutcomes are untouched.
    // --------------------------------------------------

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

    console.log(
      `Evaluation cases reset: ${stateReset.modifiedCount}`
    );

    // Remove only audit records from the Day 5
    // evaluation cycles so the experiment can run
    // cleanly from the same existing batch.
    const auditReset =
      await AuditRecordModel.deleteMany({
        caseId: /^eval-/,
      });

    console.log(
      `Evaluation audit records removed: ${auditReset.deletedCount}`
    );

    // --------------------------------------------------
    // VERIFY
    // --------------------------------------------------

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
        .sort({ caseId: 1 })
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

    if (invalidStates.length > 0) {
      throw new Error(
        `${invalidStates.length} evaluation cases were not reset to At Risk`
      );
    }

    console.log(
      "PASS: exactly 200 evaluation cases exist"
    );

    console.log(
      "PASS: all 200 cases are At Risk"
    );

    console.log(
      "PASS: hidden PotentialOutcomes were not modified"
    );

    console.log(
      "\n=== DAY 5 BATCH RESET: SUCCESS ==="
    );
  } finally {
    await disconnectMongo();
  }
}

main().catch(async (error) => {
  console.error(
    "\nDay 5 reset failed:"
  );

  console.error(error);

  try {
    await disconnectMongo();
  } catch {}

  process.exit(1);
});