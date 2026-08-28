import {
  ACTION_COSTS,
  ActionType,
} from "../config/modelingConfig";

export interface EVInput {
  action: ActionType;
  recoveryProbability: number;
  amountAtRisk: number;
}

export interface EVResult {
  action: ActionType;
  recoveryProbability: number;
  amountAtRisk: number;
  expectedRecoveryValue: number;
  actionCost: number;
  expectedValue: number;
}

/**
 * Expected Value Engine
 *
 * Converts:
 *
 *   recovery probability + amount at risk + action cost
 *
 * into an economic value for each possible action.
 *
 * EV = P(recovery) × amountAtRisk - actionCost
 *
 * IMPORTANT:
 * This component does NOT access PotentialOutcomes.
 * It only uses the estimator's predicted probability.
 */
export class EVEngine {
  calculate(input: EVInput): EVResult {
    const probability = Math.max(
      0,
      Math.min(1, input.recoveryProbability)
    );

    const amountAtRisk = Math.max(0, input.amountAtRisk);

    const actionCost = ACTION_COSTS[input.action];

    const expectedRecoveryValue =
      probability * amountAtRisk;

    const expectedValue =
      expectedRecoveryValue - actionCost;

    return {
      action: input.action,
      recoveryProbability: probability,
      amountAtRisk,
      expectedRecoveryValue,
      actionCost,
      expectedValue,
    };
  }

  calculateAll(
    amountAtRisk: number,
    probabilities: Record<ActionType, number>
  ): EVResult[] {
    const actions: ActionType[] = [
      "retry_now",
      "retry_later",
      "notify_only",
      "escalate",
      "stop",
    ];

    return actions.map((action) =>
      this.calculate({
        action,
        recoveryProbability: probabilities[action],
        amountAtRisk,
      })
    );
  }

    chooseBest(
  amountAtRisk: number,
  probabilities: Record<ActionType, number>
): EVResult {
  const results = this.calculateAll(
    amountAtRisk,
    probabilities
  );

  const sorted = [...results].sort(
    (a, b) => b.expectedValue - a.expectedValue
  );

  const best = sorted[0];
  const secondBest = sorted[1];

  // Negative EV → Stop
  if (best.expectedValue < 0) {
    return results.find(
      (result) => result.action === "stop"
    )!;
  }

  // Tie-margin detection
  const margin =
    Math.abs(best.expectedValue) > 0
      ? Math.abs(
          best.expectedValue - secondBest.expectedValue
        ) / Math.abs(best.expectedValue)
      : 0;

  if (margin <= 0.01) {
    return results.find(
      (result) => result.action === "stop"
    )!;
  }

  return best;
}
}