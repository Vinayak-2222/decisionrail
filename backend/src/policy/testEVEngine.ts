import {
  EVEngine,
} from "./EVEngine";

import {
  ActionType,
} from "../config/modelingConfig";

const engine = new EVEngine();

const amountAtRisk = 2000;

const probabilities: Record<ActionType, number> = {
  retry_now: 0.60,
  retry_later: 0.70,
  notify_only: 0.35,
  escalate: 0.50,
  stop: 0.00,
};

console.log("\n=== DAY 3: EV ENGINE TEST ===");
console.log(
  `Amount at risk: ₹${amountAtRisk}`
);

const results = engine.calculateAll(
  amountAtRisk,
  probabilities
);

console.log("\n=== ACTION VALUES ===");

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

const choice = engine.chooseBest(
  amountAtRisk,
  probabilities
);

console.log("\n=== BEST ACTION ===");
console.log(
  `Action: ${choice.best.action}`
);
console.log(
  `Expected Value: ₹${choice.best.expectedValue.toFixed(2)}`
);
console.log(
  `Tie detected: ${choice.isTie}`
);

console.log("\nStatus: SUCCESS");