import "dotenv/config";
import crypto from "crypto";

import {
  connectMongo,
  disconnectMongo,
} from "../db/mongoClient";

import {
  EvaluationCaseModel,
} from "../db/models/EvaluationCase";

import {
  PotentialOutcomesModel,
} from "../db/models/PotentialOutcomes";

import {
  MetricsService,
} from "../metrics/metricsService";

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

function stableHash(
  value: unknown
): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        value
      )
    )
    .digest("hex");
}

async function main() {
  console.log(
    "\n=== DAY 7: BATCH INTEGRITY / NO CHERRY-PICKING TEST ==="
  );

  await connectMongo();

  try {
    /*
     * --------------------------------------------------
     * 1. LOAD THE EXISTING FIXED BATCH
     * --------------------------------------------------
     */

    const cases =
      await EvaluationCaseModel.find({
        caseId: /^eval-/,
      })
        .sort({
          caseId: 1,
        })
        .lean();

    const outcomes =
      await PotentialOutcomesModel.find({
        caseId: /^eval-/,
      })
        .sort({
          caseId: 1,
        })
        .lean();

    assert(
      cases.length === 200,
      "exactly 200 evaluation cases exist"
    );

    assert(
      outcomes.length === 200,
      "exactly 200 hidden outcome records exist"
    );

    /*
     * --------------------------------------------------
     * 2. SNAPSHOT CASE IDS
     * --------------------------------------------------
     */

    const caseIds =
      cases.map(
        item => item.caseId
      );

    const outcomeIds =
      outcomes.map(
        item => item.caseId
      );

    assert(
      caseIds.every(
        (id, index) =>
          id ===
          `eval-${String(index).padStart(4, "0")}`
      ),
      "evaluation batch contains the expected fixed case IDs"
    );

    assert(
      JSON.stringify(
        caseIds
      ) ===
        JSON.stringify(
          outcomeIds
        ),
      "evaluation and hidden-outcome batches have identical case IDs"
    );

    /*
     * --------------------------------------------------
     * 3. SNAPSHOT OBSERVABLE BATCH
     * --------------------------------------------------
     *
     * Only fields that define the evaluation case are
     * included. Database-generated _id values are ignored.
     */

    const caseSnapshot =
      cases.map(
        item => ({
          caseId:
            item.caseId,

          declineCategory:
            item.declineCategory,

          hardSoft:
            item.hardSoft,

          valueTier:
            item.valueTier,

          amountAtRisk:
            item.amountAtRisk,

          attemptNumber:
            item.attemptNumber,

          historicalRecoverer:
            item.historicalRecoverer,

          serialFailer:
            item.serialFailer,

          timeRemainingDays:
            item.timeRemainingDays,
        })
      );

    /*
     * --------------------------------------------------
     * 4. SNAPSHOT HIDDEN OUTCOMES
     * --------------------------------------------------
     *
     * We intentionally hash the hidden records so we can
     * prove the metrics calculation does not regenerate or
     * replace them.
     */

    const outcomeSnapshot =
      outcomes.map(
        item => ({
          caseId:
            item.caseId,

          latentPropensity:
            item.latentPropensity,

          actionMultipliers:
            item.actionMultipliers,

          outcomes:
            item.outcomes,
        })
      );

    const beforeCaseHash =
      stableHash(
        caseSnapshot
      );

    const beforeOutcomeHash =
      stableHash(
        outcomeSnapshot
      );

    /*
     * --------------------------------------------------
     * 5. RUN METRICS
     * --------------------------------------------------
     *
     * A valid experiment must read the existing batch,
     * not regenerate it.
     */

    const service =
      new MetricsService();

    const metrics =
      await service.computeExperimentMetrics();

    assert(
      metrics.batchSize === 200,
      "metrics used the 200-case evaluation batch"
    );

    assert(
      metrics.sameBatchVerified === true,
      "metrics confirmed same evaluation batch"
    );

    assert(
      metrics.sameHiddenOutcomesVerified === true,
      "metrics confirmed same hidden outcomes"
    );

    /*
     * --------------------------------------------------
     * 6. RELOAD BOTH TABLES
     * --------------------------------------------------
     */

    const casesAfter =
      await EvaluationCaseModel.find({
        caseId: /^eval-/,
      })
        .sort({
          caseId: 1,
        })
        .lean();

    const outcomesAfter =
      await PotentialOutcomesModel.find({
        caseId: /^eval-/,
      })
        .sort({
          caseId: 1,
        })
        .lean();

    const caseSnapshotAfter =
      casesAfter.map(
        item => ({
          caseId:
            item.caseId,

          declineCategory:
            item.declineCategory,

          hardSoft:
            item.hardSoft,

          valueTier:
            item.valueTier,

          amountAtRisk:
            item.amountAtRisk,

          attemptNumber:
            item.attemptNumber,

          historicalRecoverer:
            item.historicalRecoverer,

          serialFailer:
            item.serialFailer,

          timeRemainingDays:
            item.timeRemainingDays,
        })
      );

    const outcomeSnapshotAfter =
      outcomesAfter.map(
        item => ({
          caseId:
            item.caseId,

          latentPropensity:
            item.latentPropensity,

          actionMultipliers:
            item.actionMultipliers,

          outcomes:
            item.outcomes,
        })
      );

    const afterCaseHash =
      stableHash(
        caseSnapshotAfter
      );

    const afterOutcomeHash =
      stableHash(
        outcomeSnapshotAfter
      );

    /*
     * --------------------------------------------------
     * 7. PROVE NOTHING WAS REGENERATED
     * --------------------------------------------------
     */

    assert(
      beforeCaseHash ===
        afterCaseHash,
      "evaluation batch did not change during metrics calculation"
    );

    assert(
      beforeOutcomeHash ===
        afterOutcomeHash,
      "hidden PotentialOutcomes did not change during metrics calculation"
    );

    /*
     * --------------------------------------------------
     * 8. PROVE NO CHERRY-PICKING
     * --------------------------------------------------
     */

    assert(
      casesAfter.length === 200,
      "evaluation batch still contains exactly 200 cases"
    );

    assert(
      outcomesAfter.length === 200,
      "hidden outcome table still contains exactly 200 records"
    );

    assert(
      JSON.stringify(
        casesAfter.map(
          item => item.caseId
        )
      ) ===
        JSON.stringify(
          outcomesAfter.map(
            item => item.caseId
          )
        ),
      "baseline and DecisionRail still reference the same fixed cases"
    );

    console.log(
      `case batch hash: ${beforeCaseHash}`
    );

    console.log(
      `hidden outcome hash: ${beforeOutcomeHash}`
    );

    console.log(
      `DecisionRail recovered: ₹${metrics.decisionRail.recoveredAmount}`
    );

    console.log(
      `Baseline recovered: ₹${metrics.baseline.recoveredAmount}`
    );

    console.log(
      "\n=== BATCH INTEGRITY TEST: SUCCESS ==="
    );
  } finally {
    await disconnectMongo();
  }
}

main().catch(
  async error => {
    console.error(
      "\nBatch integrity test failed:"
    );

    console.error(error);

    try {
      await disconnectMongo();
    } catch {}

    process.exit(1);
  }
);