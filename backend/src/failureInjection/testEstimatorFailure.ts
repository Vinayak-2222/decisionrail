import {
  LikelihoodEstimator,
  LikelihoodInput,
} from "../estimator/likelihoodEstimator";

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
    "\n=== DAY 7: ESTIMATOR FAILURE INJECTION ==="
  );

  const estimator =
    new LikelihoodEstimator();

  /*
   * We deliberately do NOT load/train a model.
   *
   * This simulates model unavailable/unloaded.
   */

  const input: LikelihoodInput = {
    declineCategory:
      "insufficient_funds",

    valueTier:
      "medium",

    attemptNumber:
      2,

    historicalRecoverer:
      false,

    serialFailer:
      false,

    timeRemainingDays:
      2,

    action:
      "retry_now",
  };

  const prediction =
    estimator.predict(input);

  console.log(
    "prediction:",
    prediction
  );

  assert(
    prediction.usedFallback === true,
    "model-unavailable path activates fallback"
  );

  assert(
    Number.isFinite(
      prediction.probability
    ),
    "fallback probability is numeric"
  );

  assert(
    prediction.probability >= 0 &&
      prediction.probability <= 1,
    "fallback probability is within [0,1]"
  );

  assert(
    prediction.confidence < 1,
    "fallback confidence is lower than normal model confidence"
  );

  /*
   * Simulate malformed live input.
   */
  const malformedInput =
    {
      ...input,
      timeRemainingDays:
        -1,
    } as LikelihoodInput;

  const malformedPrediction =
    estimator.predict(
      malformedInput
    );

  assert(
    malformedPrediction.usedFallback ===
      true,
    "malformed input activates fallback"
  );

  assert(
    malformedPrediction.probability >= 0 &&
      malformedPrediction.probability <= 1,
    "malformed-input fallback remains safely bounded"
  );

  console.log(
    "\n=== ESTIMATOR FAILURE TEST: SUCCESS ==="
  );
}

main().catch(
  (error) => {
    console.error(
      "\nEstimator failure test failed:"
    );

    console.error(error);

    process.exit(1);
  }
);