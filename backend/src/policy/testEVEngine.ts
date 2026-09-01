import {
  strict as assert,
} from "assert";

import {
  EVEngine,
} from "./EVEngine";

import {
  ActionType,
} from "../config/modelingConfig";

import {
  LikelihoodEstimator,
  LikelihoodInput,
} from "../estimator/likelihoodEstimator";

// --------------------------------------------------
// EXISTING EV TEST
// --------------------------------------------------

const engine =
  new EVEngine();

const amountAtRisk =
  2000;

const probabilities:
  Record<ActionType, number> = {
    retry_now: 0.60,
    retry_later: 0.70,
    notify_only: 0.35,
    escalate: 0.50,
    stop: 0.00,
  };

console.log(
  "\n=== DAY 3: EV ENGINE TEST ==="
);

console.log(
  `Amount at risk: ₹${amountAtRisk}`
);

const results =
  engine.calculateAll(
    amountAtRisk,
    probabilities
  );

console.log(
  "\n=== ACTION VALUES ==="
);

for (const result of results) {
  console.log(
    `${result.action.padEnd(14)} | ` +
    `P=${(
      result.recoveryProbability * 100
    ).toFixed(1)}% | ` +
    `Expected recovery=₹${result.expectedRecoveryValue.toFixed(2)} | ` +
    `Cost=₹${result.actionCost.toFixed(2)} | ` +
    `EV=₹${result.expectedValue.toFixed(2)}`
  );
}

const choice =
  engine.chooseBest(
    amountAtRisk,
    probabilities
  );

console.log(
  "\n=== BEST ACTION ==="
);

console.log(
  `Action: ${choice.best.action}`
);

console.log(
  `Expected Value: ₹${choice.best.expectedValue.toFixed(2)}`
);

console.log(
  `Tie detected: ${choice.isTie}`
);

assert.equal(
  choice.best.action,
  "retry_later"
);

console.log(
  "\nExisting EV test: PASS"
);

// --------------------------------------------------
// STOP INVARIANT TESTS
// --------------------------------------------------

console.log(
  "\n=== STOP INVARIANT TESTS ==="
);

const baseInput:
  LikelihoodInput = {
    declineCategory:
      "insufficient_funds",

    valueTier:
      "low",

    attemptNumber:
      1,

    historicalRecoverer:
      false,

    serialFailer:
      false,

    timeRemainingDays:
      3,

    action:
      "stop",
  };

// --------------------------------------------------
// TEST 1
// TRAINED MODEL PATH
// --------------------------------------------------

const trainedEstimator =
  new LikelihoodEstimator();

// Load deliberately non-zero weights so this test
// proves that STOP bypasses the trained model rather
// than merely returning zero because of its weights.
trainedEstimator.loadModel({
  weights: new Array(15).fill(1),
  bias: 1,
});

const trainedStop =
  trainedEstimator.predict(
    baseInput
  );

assert.equal(
  trainedStop.probability,
  0
);

assert.equal(
  trainedStop.confidence,
  1
);

assert.equal(
  trainedStop.usedFallback,
  false
);

console.log(
  "1. STOP probability = 0 on trained path: PASS"
);

// --------------------------------------------------
// TEST 2
// FALLBACK PATH
// --------------------------------------------------

const fallbackEstimator =
  new LikelihoodEstimator();

const fallbackStop =
  fallbackEstimator.predict(
    baseInput
  );

assert.equal(
  fallbackStop.probability,
  0
);

assert.equal(
  fallbackStop.confidence,
  1
);

assert.equal(
  fallbackStop.usedFallback,
  true
);

console.log(
  "2. STOP probability = 0 on fallback path: PASS"
);

// --------------------------------------------------
// TEST 3
// HISTORICAL RECOVERER MUST NOT INCREASE STOP
// --------------------------------------------------

const historicalRecovererStop =
  fallbackEstimator.predict({
    ...baseInput,

    historicalRecoverer:
      true,

    serialFailer:
      false,
  });

assert.equal(
  historicalRecovererStop.probability,
  0
);

console.log(
  "3. historicalRecoverer cannot increase STOP probability: PASS"
);

// --------------------------------------------------
// TEST 4
// SERIAL FAILER MUST NOT CHANGE STOP
// --------------------------------------------------

const serialFailerStop =
  fallbackEstimator.predict({
    ...baseInput,

    historicalRecoverer:
      false,

    serialFailer:
      true,
  });

assert.equal(
  serialFailerStop.probability,
  0
);

console.log(
  "4. serialFailer cannot change STOP probability: PASS"
);

// --------------------------------------------------
// EV DEFENSE-IN-DEPTH TEST
// --------------------------------------------------

const defensiveStop =
  engine.calculate({
    action:
      "stop",

    // Deliberately incorrect input.
    // EVEngine itself must still protect STOP.
    recoveryProbability:
      0.80,

    amountAtRisk:
      10000,
  });

assert.equal(
  defensiveStop.recoveryProbability,
  0
);

assert.equal(
  defensiveStop.expectedRecoveryValue,
  0
);

assert.equal(
  defensiveStop.expectedValue,
  0
);

console.log(
  "5. EVEngine blocks non-zero STOP recovery probability: PASS"
);

console.log(
  "\n=== RESULT ==="
);

console.log(
  "All STOP invariants passed."
);

console.log(
  "Status: SUCCESS"
);