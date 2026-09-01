import {
  EvaluationCaseModel,
} from "../db/models/EvaluationCase";

import {
  PotentialOutcomesModel,
} from "../db/models/PotentialOutcomes";

import {
  connectMongo,
  disconnectMongo,
} from "../db/mongoClient";

import {
  buildCaseContext,
} from "../context/contextBuilder";

import {
  BaselinePolicy,
} from "../policy/BaselinePolicy";

import {
  ActionType,
} from "../config/modelingConfig";

interface BaselineResult {
  caseId: string;
  action: ActionType;
  recovered: boolean;
  amountAtRisk: number;
}

const EXPECTED_EVALUATION_CASE_COUNT =
  200;

export async function evaluateBaseline(): Promise<void> {
  await connectMongo();

  try {
    console.log(
      "\n=== DAY 3: BASELINE EVALUATION ==="
    );

    // --------------------------------------------------
    // LOAD ONLY THE FIXED SYNTHETIC EVALUATION BATCH
    // --------------------------------------------------

    const cases =
      await EvaluationCaseModel.find({
        caseId: /^eval-/,
      })
        .sort({
          caseId: 1,
        })
        .lean();

    console.log(
      `Evaluation cases loaded: ${cases.length}`
    );

    if (
      cases.length !==
      EXPECTED_EVALUATION_CASE_COUNT
    ) {
      throw new Error(
        `Expected exactly ${EXPECTED_EVALUATION_CASE_COUNT} evaluation cases, found ${cases.length}`
      );
    }

    const policy =
      new BaselinePolicy();

    const results:
      BaselineResult[] = [];

    // --------------------------------------------------
    // EVALUATE BASELINE
    // --------------------------------------------------

    for (
      const evaluationCase of cases
    ) {
      const context =
        buildCaseContext(
          evaluationCase
        );

      const action =
        policy.decide(
          context
        );

      /*
       * Hidden outcomes are used only for
       * evaluation, never for choosing the
       * baseline action.
       */
      const hiddenOutcome =
        await PotentialOutcomesModel.findOne({
          caseId:
            evaluationCase.caseId,
        }).lean();

      if (
        !hiddenOutcome
      ) {
        throw new Error(
          `Missing hidden outcome for ${evaluationCase.caseId}`
        );
      }

      const recovered =
        hiddenOutcome.outcomes[
          action
        ] ?? false;

      results.push({
        caseId:
          evaluationCase.caseId,

        action,

        recovered,

        amountAtRisk:
          evaluationCase.amountAtRisk,
      });
    }

    // --------------------------------------------------
    // FINAL SANITY CHECKS
    // --------------------------------------------------

    if (
      results.length !==
      EXPECTED_EVALUATION_CASE_COUNT
    ) {
      throw new Error(
        `Expected ${EXPECTED_EVALUATION_CASE_COUNT} results, got ${results.length}`
      );
    }

    const caseIds =
      results.map(
        (result) =>
          result.caseId
      );

    const uniqueCaseIds =
      new Set(caseIds);

    if (
      uniqueCaseIds.size !==
      results.length
    ) {
      throw new Error(
        "Duplicate case IDs detected in baseline results"
      );
    }

    const validActions:
      ActionType[] = [
        "retry_now",
        "retry_later",
        "notify_only",
        "escalate",
        "stop",
      ];

    const invalidResults =
      results.filter(
        (result) =>
          !validActions.includes(
            result.action
          )
      );

    if (
      invalidResults.length > 0
    ) {
      throw new Error(
        `Found ${invalidResults.length} results with invalid actions`
      );
    }

    console.log(
      "\n=== BASELINE SANITY CHECK ==="
    );

    console.log(
      `case count: ${results.length} / ${EXPECTED_EVALUATION_CASE_COUNT}`
    );

    console.log(
      `unique case IDs: ${uniqueCaseIds.size}`
    );

    console.log(
      "all cases received a valid action: YES"
    );

    console.log(
      "all cases had hidden outcomes: YES"
    );

    // --------------------------------------------------
    // BASELINE METRICS
    // --------------------------------------------------

    const recoveredCount =
      results.filter(
        (result) =>
          result.recovered
      ).length;

    const totalAmountAtRisk =
      results.reduce(
        (sum, result) =>
          sum +
          result.amountAtRisk,
        0
      );

    const recoveredAmount =
      results
        .filter(
          (result) =>
            result.recovered
        )
        .reduce(
          (sum, result) =>
            sum +
            result.amountAtRisk,
          0
        );

    const recoveryRate =
      (
        recoveredCount /
        results.length
      ) *
      100;

    // --------------------------------------------------
    // RESULTS
    // --------------------------------------------------

    console.log(
      "\n=== BASELINE EVALUATION ==="
    );

    console.log(
      `evaluation cases: ${results.length}`
    );

    console.log(
      `recovered cases: ${recoveredCount}`
    );

    console.log(
      `recovery rate: ${recoveryRate.toFixed(
        2
      )}%`
    );

    console.log(
      `total amount at risk: ₹${totalAmountAtRisk}`
    );

    console.log(
      `recovered amount: ₹${recoveredAmount}`
    );

    console.log(
      "\n=== SAMPLE RESULTS ==="
    );

    console.log(
      JSON.stringify(
        results.slice(0, 5),
        null,
        2
      )
    );

    console.log(
      "\n=== BASELINE EVALUATION STATUS ==="
    );

    console.log(
      "Synthetic evaluation batch: eval-* only"
    );

    console.log(
      `Evaluation case count verified: ${results.length} / ${EXPECTED_EVALUATION_CASE_COUNT}`
    );

    console.log(
      "Baseline actions evaluated against hidden outcomes: YES"
    );

    console.log(
      "Status: SUCCESS"
    );
  } finally {
    await disconnectMongo();
  }
}

if (
  require.main === module
) {
  evaluateBaseline().catch(
    (error) => {
      console.error(
        "[baseline] evaluation failed:",
        error
      );

      process.exit(1);
    }
  );
}