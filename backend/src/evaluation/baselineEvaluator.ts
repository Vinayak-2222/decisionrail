import { EvaluationCaseModel } from "../db/models/EvaluationCase";
import { PotentialOutcomesModel } from "../db/models/PotentialOutcomes";
import { connectMongo, disconnectMongo } from "../db/mongoClient";
import { buildCaseContext } from "../context/contextBuilder";
import { BaselinePolicy } from "../policy/BaselinePolicy";
import { ActionType } from "../config/modelingConfig";

interface BaselineResult {
  caseId: string;
  action: ActionType;
  recovered: boolean;
  amountAtRisk: number;
}

export async function evaluateBaseline(): Promise<void> {
  await connectMongo();

  try {
    const cases = await EvaluationCaseModel.find()
      .sort({ caseId: 1 })
      .lean();

    const policy = new BaselinePolicy();

    const results: BaselineResult[] = [];

    for (const evaluationCase of cases) {
      const context = buildCaseContext(evaluationCase);
      const action = policy.decide(context);

      const hiddenOutcome = await PotentialOutcomesModel.findOne({
        caseId: evaluationCase.caseId,
      }).lean();

      if (!hiddenOutcome) {
        throw new Error(
          `Missing hidden outcome for ${evaluationCase.caseId}`
        );
      }

      const recovered =
        hiddenOutcome.outcomes[action] ?? false;

      results.push({
        caseId: evaluationCase.caseId,
        action,
        recovered,
        amountAtRisk: evaluationCase.amountAtRisk,
      });
    }

        // Final Day 2 sanity checks
    const expectedCaseCount = 200;

    if (results.length !== expectedCaseCount) {
      throw new Error(
        `Expected ${expectedCaseCount} results, got ${results.length}`
      );
    }

    const caseIds = results.map((result) => result.caseId);
    const uniqueCaseIds = new Set(caseIds);

    if (uniqueCaseIds.size !== results.length) {
      throw new Error("Duplicate case IDs detected in baseline results");
    }

    const validActions: ActionType[] = [
      "retry_now",
      "retry_later",
      "notify_only",
      "escalate",
      "stop",
    ];

    const invalidResults = results.filter(
      (result) => !validActions.includes(result.action)
    );

    if (invalidResults.length > 0) {
      throw new Error(
        `Found ${invalidResults.length} results with invalid actions`
      );
    }

    console.log("\n=== DAY 2 SANITY CHECK ===");
    console.log(`case count: ${results.length} / ${expectedCaseCount}`);
    console.log(`unique case IDs: ${uniqueCaseIds.size}`);
    console.log("all cases received a valid action: YES");
    console.log("all cases had hidden outcomes: YES");

    const recoveredCount = results.filter(
      (result) => result.recovered
    ).length;

    const totalAmountAtRisk = results.reduce(
      (sum, result) => sum + result.amountAtRisk,
      0
    );

    const recoveredAmount = results
      .filter((result) => result.recovered)
      .reduce(
        (sum, result) => sum + result.amountAtRisk,
        0
      );

    console.log("\n=== BASELINE EVALUATION ===");
    console.log(`evaluation cases: ${results.length}`);
    console.log(`recovered cases: ${recoveredCount}`);
    console.log(
      `recovery rate: ${
        ((recoveredCount / results.length) * 100).toFixed(2)
      }%`
    );
    console.log(
      `total amount at risk: ${totalAmountAtRisk}`
    );
    console.log(
      `recovered amount: ${recoveredAmount}`
    );

    console.log("\n=== SAMPLE RESULTS ===");

    console.log(
      JSON.stringify(results.slice(0, 5), null, 2)
    );
  } finally {
    await disconnectMongo();
  }
}

if (require.main === module) {
  evaluateBaseline().catch((error) => {
    console.error("[baseline] evaluation failed:", error);
    process.exit(1);
  });
}