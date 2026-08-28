import {
  connectMongo,
  disconnectMongo,
} from "../db/mongoClient";

import {
  MetricsService,
} from "./metricsService";

async function main() {
  await connectMongo();

  try {
    console.log(
      "\n=== DAY 5: METRICS / EXPERIMENT TEST ==="
    );

    const service =
      new MetricsService();

    const metrics =
      await service.computeExperimentMetrics();

    console.log(
      "\n=== EXPERIMENT INTEGRITY ==="
    );

    console.log(
      `batch size: ${metrics.batchSize}`
    );

    console.log(
      `same batch verified: ${metrics.sameBatchVerified}`
    );

    console.log(
      `same hidden outcomes verified: ${metrics.sameHiddenOutcomesVerified}`
    );

    if (metrics.batchSize !== 200) {
      throw new Error(
        `Expected batch size 200, got ${metrics.batchSize}`
      );
    }

    if (!metrics.sameBatchVerified) {
      throw new Error(
        "Same-batch verification failed."
      );
    }

    if (!metrics.sameHiddenOutcomesVerified) {
      throw new Error(
        "Same-hidden-outcomes verification failed."
      );
    }

    console.log(
      "\n=== DECISIONRAIL ==="
    );

    console.log(
      `recovered amount: ₹${metrics.decisionRail.recoveredAmount}`
    );

    console.log(
      `recovered cases: ${metrics.decisionRail.recoveredCases}`
    );

    console.log(
      `recovery rate: ${metrics.decisionRail.recoveryRate.toFixed(2)}%`
    );

    console.log(
      `retry cases: ${metrics.decisionRail.retryCases}`
    );

    console.log(
      `stop cases: ${metrics.decisionRail.stopCases}`
    );

    console.log(
      `escalation cases: ${metrics.decisionRail.escalationCases}`
    );

    console.log(
      "\n=== BASELINE ==="
    );

    console.log(
      `recovered amount: ₹${metrics.baseline.recoveredAmount}`
    );

    console.log(
      `recovered cases: ${metrics.baseline.recoveredCases}`
    );

    console.log(
      `recovery rate: ${metrics.baseline.recoveryRate.toFixed(2)}%`
    );

    console.log(
      "\n=== COMPARISON ==="
    );

    console.log(
      `incremental recovered amount: ₹${metrics.incrementalRecoveredAmount}`
    );

    console.log(
      `recovery-rate improvement: ${metrics.recoveryRateImprovementPercentagePoints.toFixed(2)} percentage points`
    );

    console.log(
      `relative recovered-amount improvement: ${metrics.relativeRecoveredAmountImprovementPercent.toFixed(2)}%`
    );

    console.log(
      `wasted retries avoided: ${metrics.wastedRetriesAvoided}`
    );

    console.log(
      `high-value accounts saved: ${metrics.highValueAccountsSaved}`
    );

    console.log(
      `unnecessary write-off rate: ${metrics.unnecessaryWriteOffRate.toFixed(2)}%`
    );

    console.log(
      `false escalation rate available: ${metrics.falseEscalationRateAvailable}`
    );

    console.log(
      `false escalation rate: ${
        metrics.falseEscalationRate === null
          ? "INSUFFICIENT DATA"
          : `${metrics.falseEscalationRate.toFixed(2)}%`
      }`
    );

    console.log(
      `reason: ${metrics.falseEscalationRateReason}`
    );

    console.log(
      "\n=== DAY 5 METRICS TEST: SUCCESS ==="
    );

    console.log(
      "\nFull metrics object:"
    );

    console.log(
      JSON.stringify(
        metrics,
        null,
        2
      )
    );
  } finally {
    await disconnectMongo();
  }
}

main().catch(async (error) => {
  console.error(
    "\nMetrics test failed:"
  );

  console.error(error);

  try {
    await disconnectMongo();
  } catch {}

  process.exit(1);
});