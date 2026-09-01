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

export interface EVChoice {
  best: EVResult;
  secondBest: EVResult;
  isTie: boolean;
}

/**
 * Expected Value Engine
 *
 * EV = P(recovery) × amountAtRisk - actionCost
 *
 * IMPORTANT:
 * This component does NOT access PotentialOutcomes.
 * It only uses estimator probabilities.
 *
 * STOP is a non-recovery terminal action.
 * Therefore its expected recovery value is ALWAYS 0.
 */
export class EVEngine {
  calculate(
    input: EVInput
  ): EVResult {
    const probability =
      Math.max(
        0,
        Math.min(
          1,
          input.recoveryProbability
        )
      );

    const amountAtRisk =
      Math.max(
        0,
        input.amountAtRisk
      );

    const actionCost =
      ACTION_COSTS[input.action];

    /**
     * STOP never produces incremental recovery.
     *
     * This is a defense-in-depth invariant:
     * even if a caller accidentally supplies a
     * non-zero recovery probability for STOP,
     * the EV engine will never convert it into
     * expected recovered revenue.
     */
    const expectedRecoveryValue =
      input.action === "stop"
        ? 0
        : probability * amountAtRisk;

    const expectedValue =
      expectedRecoveryValue -
      actionCost;

    return {
      action:
        input.action,

      recoveryProbability:
        input.action === "stop"
          ? 0
          : probability,

      amountAtRisk,

      expectedRecoveryValue,

      actionCost,

      expectedValue,
    };
  }

  calculateAll(
    amountAtRisk: number,
    probabilities: Record<
      ActionType,
      number
    >
  ): EVResult[] {
    const actions: ActionType[] = [
      "retry_now",
      "retry_later",
      "notify_only",
      "escalate",
      "stop",
    ];

    return actions.map(
      (action) =>
        this.calculate({
          action,
          recoveryProbability:
            probabilities[action],
          amountAtRisk,
        })
    );
  }

  /**
   * Selects the highest-EV action.
   *
   * IMPORTANT:
   * Tie detection belongs here as information,
   * but this engine does NOT convert a tie into
   * an action such as "stop". The policy layer
   * decides whether a tie requires human review.
   */
  chooseBest(
    amountAtRisk: number,
    probabilities: Record<
      ActionType,
      number
    >
  ): EVChoice {
    const results =
      this.calculateAll(
        amountAtRisk,
        probabilities
      );

    const sorted =
      [...results].sort(
        (a, b) =>
          b.expectedValue -
          a.expectedValue
      );

    const best =
      sorted[0];

    const secondBest =
      sorted[1];

    if (
      !best ||
      !secondBest
    ) {
      throw new Error(
        "EVEngine requires at least two candidate actions."
      );
    }

    // If every candidate has non-positive EV,
    // the policy should choose Stop.
    if (
      best.expectedValue <= 0
    ) {
      const stop =
        results.find(
          (result) =>
            result.action ===
            "stop"
        );

      if (!stop) {
        throw new Error(
          "Stop action is required but was not found."
        );
      }

      return {
        best: stop,
        secondBest,
        isTie: false,
      };
    }

    const margin =
      Math.abs(
        best.expectedValue
      ) > 0
        ? Math.abs(
            best.expectedValue -
              secondBest.expectedValue
          ) /
          Math.abs(
            best.expectedValue
          )
        : 0;

    return {
      best,
      secondBest,
      isTie:
        margin <= 0.01,
    };
  }
}