import fs from "fs";
import path from "path";

import {
  ActionType,
} from "../config/modelingConfig";

import {
  EvaluationCaseModel,
} from "../db/models/EvaluationCase";

import {
  PotentialOutcomesModel,
} from "../db/models/PotentialOutcomes";

import {
  TrainingRowModel,
} from "../db/models/TrainingRow";

import {
  LikelihoodEstimator,
  LikelihoodInput,
} from "../estimator/likelihoodEstimator";

import {
  EVEngine,
} from "../policy/EVEngine";

import {
  connectMongo,
  disconnectMongo,
} from "../db/mongoClient";

const ALL_ACTIONS: ActionType[] = [
  "retry_now",
  "retry_later",
  "notify_only",
  "escalate",
  "stop",
];

// Locked Day 2 baseline result.
const BASELINE_RECOVERED_AMOUNT =
  146614;

const BASELINE_RECOVERY_RATE =
  30.5;

const EXPECTED_EVALUATION_CASE_COUNT =
  200;

async function main() {
  await connectMongo();

  try {
    console.log(
      "\n=== DAY 3: DECISIONRAIL EVALUATION ==="
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

    // --------------------------------------------------
    // LOAD TRAINING DATA
    // --------------------------------------------------

    const trainingRows =
      await TrainingRowModel.find()
        .lean();

    console.log(
      `Training rows loaded: ${trainingRows.length}`
    );

    if (
      trainingRows.length === 0
    ) {
      throw new Error(
        "No training rows found. Run `npm run generate` first."
      );
    }

    // --------------------------------------------------
    // LOAD FROZEN LIKELIHOOD MODEL
    // --------------------------------------------------

    /*
     * Train only from the observed training corpus.
     *
     * IMPORTANT:
     * PotentialOutcomes is deliberately NOT used during training.
     */
    const modelPath =
      path.join(
        process.cwd(),
        "models",
        "likelihoodEstimator.phase5-v1.json"
      );

    const modelArtifact =
      JSON.parse(
        fs.readFileSync(
          modelPath,
          "utf-8"
        )
      );

    const estimator =
      LikelihoodEstimator.fromModel(
        modelArtifact
      );

    console.log(
      "Frozen likelihood model loaded."
    );

    const evEngine =
      new EVEngine();

    let processed = 0;

    let recoveredCount = 0;

    let recoveredAmount = 0;

    let totalAmountAtRisk = 0;

    // --------------------------------------------------
    // EVALUATE ALL 200 CASES
    // --------------------------------------------------

    for (
      const currentCase of cases
    ) {
      const probabilities =
        {} as Record<
          ActionType,
          number
        >;

      /*
       * Estimate recovery probability for
       * every possible action.
       */
      for (
        const action of ALL_ACTIONS
      ) {
        const input:
          LikelihoodInput = {
          declineCategory:
            currentCase.declineCategory,

          valueTier:
            currentCase.valueTier,

          attemptNumber:
            currentCase.attemptNumber,

          historicalRecoverer:
            currentCase.historicalRecoverer,

          serialFailer:
            currentCase.serialFailer,

          timeRemainingDays:
            currentCase.timeRemainingDays,

          action,
        };

        const prediction =
          estimator.predict(
            input
          );

        probabilities[action] =
          prediction.probability;
      }

      /*
       * Convert probabilities into
       * expected monetary values.
       */
      const evResults =
        evEngine.calculateAll(
          currentCase.amountAtRisk,
          probabilities
        );

      /*
       * Choose the action with the
       * highest expected value.
       */
      const best =
        evResults.reduce(
          (winner, current) =>
            current.expectedValue >
            winner.expectedValue
              ? current
              : winner
        );

      /*
       * NOW — and only now — consult the
       * hidden ground truth.
       *
       * This is evaluation only.
       * It does not influence the decision.
       */
      const hiddenOutcome =
        await PotentialOutcomesModel.findOne({
          caseId:
            currentCase.caseId,
        }).lean();

      if (
        !hiddenOutcome
      ) {
        throw new Error(
          `Missing hidden outcome for ${currentCase.caseId}`
        );
      }

      const recovered =
        hiddenOutcome.outcomes[
          best.action
        ] ?? false;

      processed++;

      totalAmountAtRisk +=
        currentCase.amountAtRisk;

      if (
        recovered
      ) {
        recoveredCount++;

        recoveredAmount +=
          currentCase.amountAtRisk;
      }

      // --------------------------------------------------
      // PRINT FIRST FIVE DECISIONS
      // --------------------------------------------------

      if (
        processed <= 5
      ) {
        console.log(
          "\n--- SAMPLE DECISION ---"
        );

        console.log(
          `caseId: ${currentCase.caseId}`
        );

        console.log(
          `amount at risk: ₹${currentCase.amountAtRisk}`
        );

        console.log(
          `decline: ${currentCase.declineCategory}`
        );

        console.log(
          "\nPredicted probabilities:"
        );

        for (
          const action of ALL_ACTIONS
        ) {
          console.log(
            `  ${action.padEnd(
              14
            )} ${(
              probabilities[action] *
              100
            ).toFixed(2)}%`
          );
        }

        console.log(
          "\nEV results:"
        );

        for (
          const result of evResults
        ) {
          console.log(
            `  ${result.action.padEnd(
              14
            )} ₹${result.expectedValue.toFixed(
              2
            )}`
          );
        }

        console.log(
          `\nCHOSEN ACTION: ${best.action}`
        );

        console.log(
          `BEST EXPECTED VALUE: ₹${best.expectedValue.toFixed(
            2
          )}`
        );

        console.log(
          `ACTUAL HIDDEN OUTCOME: ${
            recovered
              ? "RECOVERED"
              : "NOT RECOVERED"
          }`
        );
      }
    }

    // --------------------------------------------------
    // FINAL METRICS
    // --------------------------------------------------

    const recoveryRate =
      (recoveredCount /
        processed) *
      100;

    const incrementalAmount =
      recoveredAmount -
      BASELINE_RECOVERED_AMOUNT;

    const relativeImprovementPct =
      (
        incrementalAmount /
        BASELINE_RECOVERED_AMOUNT
      ) *
      100;

    const recoveryRateImprovement =
      recoveryRate -
      BASELINE_RECOVERY_RATE;

    // --------------------------------------------------
    // FINAL SANITY CHECKS
    // --------------------------------------------------

    if (
      processed !==
      cases.length
    ) {
      throw new Error(
        `Processed ${processed} cases, expected ${cases.length}`
      );
    }

    if (
      totalAmountAtRisk <= 0
    ) {
      throw new Error(
        "Total amount at risk must be greater than zero"
      );
    }

    // --------------------------------------------------
    // RESULTS
    // --------------------------------------------------

    console.log(
      "\n=== DAY 3: DECISIONRAIL RESULTS ==="
    );

    console.log(
      `cases processed: ${processed}`
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
      `DecisionRail recovered amount: ₹${recoveredAmount}`
    );

    console.log(
      "\n=== BASELINE VS DECISIONRAIL ==="
    );

    console.log(
      `Baseline recovered amount:     ₹${BASELINE_RECOVERED_AMOUNT}`
    );

    console.log(
      `DecisionRail recovered amount: ₹${recoveredAmount}`
    );

    console.log(
      `Incremental recovered amount:  ₹${incrementalAmount}`
    );

    console.log(
      `Baseline recovery rate:        ${BASELINE_RECOVERY_RATE.toFixed(
        2
      )}%`
    );

    console.log(
      `DecisionRail recovery rate:    ${recoveryRate.toFixed(
        2
      )}%`
    );

    console.log(
      `Recovery-rate improvement:     ${recoveryRateImprovement.toFixed(
        2
      )} percentage points`
    );

    console.log(
      `Relative ₹ improvement:        ${relativeImprovementPct.toFixed(
        2
      )}%`
    );

    console.log(
      "\n=== DAY 3 EVALUATION STATUS ==="
    );

    console.log(
      "Synthetic evaluation batch: eval-* only"
    );

    console.log(
      `Evaluation case count verified: ${processed} / ${EXPECTED_EVALUATION_CASE_COUNT}`
    );

    console.log(
      "Estimator → EV Engine → Policy: CONNECTED"
    );

    console.log(
      "DecisionRail actions evaluated against hidden outcomes: YES"
    );

    console.log(
      "Training used PotentialOutcomes: NO"
    );

    console.log(
      "Evaluation used PotentialOutcomes: YES"
    );

    console.log(
      "Status: SUCCESS"
    );
  } finally {
    await disconnectMongo();
  }
}

main().catch(
  async (err) => {
    console.error(
      "\nDecision evaluation failed:"
    );

    console.error(err);

    try {
      await disconnectMongo();
    } catch {}

    process.exit(1);
  }
);