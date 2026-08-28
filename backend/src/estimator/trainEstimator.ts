import "dotenv/config";
import fs from "fs";
import path from "path";
import { readFileSync } from "fs";

import { connectMongo, disconnectMongo } from "../db/mongoClient";
import { TrainingRowModel } from "../db/models/TrainingRow";
import {
  LikelihoodEstimator,
  LikelihoodInput,
} from "./likelihoodEstimator";

function calculateBrierScore(
  estimator: LikelihoodEstimator,
  validationRows: any[]
): number {
  let totalSquaredError = 0;

  for (const row of validationRows) {
    const input: LikelihoodInput = {
      declineCategory: row.declineCategory,
      valueTier: row.valueTier,
      attemptNumber: row.attemptNumber,
      historicalRecoverer: row.historicalRecoverer,
      serialFailer: row.serialFailer,
      timeRemainingDays: row.timeRemainingDays,
      action: row.action,
    };

    const prediction = estimator.predict(input).probability;
    const actual = row.recovered ? 1 : 0;

    totalSquaredError += Math.pow(prediction - actual, 2);
  }

  return totalSquaredError / validationRows.length;
}

async function main() {
  await connectMongo();

  try {
    console.log("\n=== DAY 3: LIKELIHOOD ESTIMATOR ===");

    const rows = await TrainingRowModel.find().lean();

    console.log(`Total rows loaded: ${rows.length}`);

    if (rows.length === 0) {
      throw new Error(
        "No training rows found. Run `npm run generate` first."
      );
    }

    /*
     * Deterministic 80/20 split.
     *
     * 80% = training
     * 20% = held-out validation
     */
    const splitIndex = Math.floor(rows.length * 0.85);

    const trainingRows = rows.slice(0, splitIndex);
    const validationRows = rows.slice(splitIndex);

    console.log(
      `Training split: ${trainingRows.length} rows`
    );

    console.log(
      `Validation split: ${validationRows.length} rows`
    );

    const estimator = new LikelihoodEstimator();

    console.log(
      "\nTraining logistic-regression estimator..."
    );

    estimator.train(trainingRows);
    const modelArtifact = estimator.exportModel();
    const modelPath = path.join(
  process.cwd(),
  "models",
  "likelihoodEstimator.phase5-v1.json"
);
    fs.writeFileSync(
  path.join(process.cwd(), "models", "likelihoodEstimator.phase5-v1.json"),
  JSON.stringify(modelArtifact, null, 2)
);

    console.log("Training complete.");

    /*
     * Calibration check on held-out validation data.
     */
    const brierScore = calculateBrierScore(
      estimator,
      validationRows
    );

    console.log("\n=== CALIBRATION CHECK ===");

    console.log(
      `Validation rows: ${validationRows.length}`
    );

    console.log(
      `Brier score: ${brierScore.toFixed(4)}`
    );

    /*
     * Smoke test using a validation row.
     */
    const sample = validationRows[0];

    const input: LikelihoodInput = {
      declineCategory: sample.declineCategory,
      valueTier: sample.valueTier,
      attemptNumber: sample.attemptNumber,
      historicalRecoverer: sample.historicalRecoverer,
      serialFailer: sample.serialFailer,
      timeRemainingDays: sample.timeRemainingDays,
      action: sample.action,
    };

    const prediction = estimator.predict(input);

    console.log("\n=== VALIDATION SAMPLE PREDICTION ===");

    console.log(`caseId: ${sample.caseId}`);

    console.log(`action: ${sample.action}`);

    console.log(
      `estimated recovery probability: ${(prediction.probability * 100).toFixed(2)}%`
    );

    console.log(
      `actual recovery: ${sample.recovered ? "YES" : "NO"}`
    );

    console.log("\n=== ESTIMATOR STATUS ===");

    console.log(
      "Training source: TrainingRow collection"
    );

    console.log(
      "Training rows used: 85%"
    );

    console.log(
      "Held-out validation rows: 15%"
    );

    console.log(
      "Hidden PotentialOutcomes: NOT USED"
    );

    console.log(
      "Calibration metric: Brier score"
    );

    console.log("Status: SUCCESS");
  } finally {
    await disconnectMongo();
  }
}

main().catch(async (err) => {
  console.error("\nEstimator training failed:");
  console.error(err);

  try {
    await disconnectMongo();
  } catch {}

  process.exit(1);
});
