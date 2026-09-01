import {
  ActionType,
  DeclineCategory,
  ValueTier,
  BASE_PROPENSITY_BY_CATEGORY,
  ACTION_MULTIPLIERS,
  CONFIG_VERSION,
} from "../config/modelingConfig";

import { TrainingRow } from "../generator/types";

export interface LikelihoodInput {
  declineCategory: DeclineCategory;
  valueTier: ValueTier;
  attemptNumber: 1 | 2 | 3;
  historicalRecoverer: boolean;
  serialFailer: boolean;
  timeRemainingDays: number;
  action: ActionType;
}

export interface LikelihoodPrediction {
  probability: number;
  confidence: number;
  usedFallback: boolean;
}

/**
 * Logistic-regression estimator.
 *
 * Normal path:
 *   P(recovery | context, action)
 *
 * Fallback path:
 *   category prior × action multiplier
 *
 * STOP is a deliberate terminal action.
 * It never represents incremental recovery, so its
 * recovery probability is structurally fixed at 0.
 *
 * PotentialOutcomes is NEVER used here.
 */
export class LikelihoodEstimator {
  private weights: number[];
  private bias: number;

  private readonly learningRate: number;
  private readonly epochs: number;

  constructor(
    learningRate = 0.05,
    epochs = 1000
  ) {
    this.learningRate = learningRate;
    this.epochs = epochs;

    this.weights = [];
    this.bias = 0;
  }

  loadModel(model: {
    weights: number[];
    bias: number;
  }): void {
    this.weights = [...model.weights];
    this.bias = model.bias;
  }

  train(rows: TrainingRow[]): void {
    if (rows.length === 0) {
      throw new Error(
        "Cannot train LikelihoodEstimator with zero rows."
      );
    }

    const X = rows.map((row) =>
      this.encode({
        declineCategory: row.declineCategory,
        valueTier: row.valueTier,
        attemptNumber: row.attemptNumber,
        historicalRecoverer: row.historicalRecoverer,
        serialFailer: row.serialFailer,
        timeRemainingDays: row.timeRemainingDays,
        action: row.action,
      })
    );

    const y = rows.map((row) =>
      row.recovered ? 1 : 0
    );

    this.weights = new Array(
      X[0].length
    ).fill(0);

    this.bias = 0;

    for (
      let epoch = 0;
      epoch < this.epochs;
      epoch++
    ) {
      const gradients = new Array(
        this.weights.length
      ).fill(0);

      let biasGradient = 0;

      for (let i = 0; i < X.length; i++) {
        const probability = this.sigmoid(
          this.dot(X[i], this.weights) +
            this.bias
        );

        const error = probability - y[i];

        for (
          let j = 0;
          j < this.weights.length;
          j++
        ) {
          gradients[j] +=
            error * X[i][j];
        }

        biasGradient += error;
      }

      const n = X.length;

      for (
        let j = 0;
        j < this.weights.length;
        j++
      ) {
        this.weights[j] -=
          this.learningRate *
          (gradients[j] / n);
      }

      this.bias -=
        this.learningRate *
        (biasGradient / n);
    }
  }

  /**
   * Normal inference path.
   *
   * STOP is structurally defined as having
   * zero incremental recovery probability.
   *
   * If the model has not been trained or the input
   * cannot be encoded safely, use the category-prior
   * fallback instead of crashing.
   */
  predict(
    input: LikelihoodInput
  ): LikelihoodPrediction {
    try {
  if (
    this.weights.length === 0 ||
    !this.isValidInput(input)
  ) {
    return this.predictFromCategoryPrior(
      input
    );
  }

  // STOP INVARIANT
  //
  // A trained model is never allowed to assign
  // recovery probability to STOP.
  if (input.action === "stop") {
    return {
      probability: 0,
      confidence: 1,
      usedFallback: false,
    };
  }

  const features =
    this.encode(input);



      const probability =
        this.sigmoid(
          this.dot(
            features,
            this.weights
          ) + this.bias
        );

      return {
        probability: this.clipProbability(
          probability
        ),
        confidence: 1,
        usedFallback: false,
      };
    } catch {
      return this.predictFromCategoryPrior(
        input
      );
    }
  }

  /**
   * Category-prior fallback.
   *
   * Uses only the configured category prior and
   * action multiplier. It does NOT use
   * PotentialOutcomes.
   *
   * STOP is always zero recovery regardless of
   * historical flags or category prior.
   */
  private predictFromCategoryPrior(
    input: LikelihoodInput
  ): LikelihoodPrediction {
    const category =
      this.isValidDeclineCategory(
        input?.declineCategory
      )
        ? input.declineCategory
        : "other_unclassified";

    const action: ActionType =
      this.isValidAction(input?.action)
        ? input.action
        : "stop";

    // --------------------------------------------------
    // STOP INVARIANT
    // --------------------------------------------------
    //
    // Do this before historical flag adjustments so
    // recoverer/failer flags cannot create recovery
    // probability for STOP.
    //
    if (action === "stop") {
      return {
        probability: 0,
        confidence: 1,
        usedFallback: true,
      };
    }

    const prior =
      BASE_PROPENSITY_BY_CATEGORY[
        category
      ];

    const mean =
      prior.alpha /
      (prior.alpha + prior.beta);

    const multiplier =
      ACTION_MULTIPLIERS[category][action];

    let probability =
      mean * multiplier;

    /*
     * Historical flags are deliberately included
     * in the fallback because they are available
     * without requiring model weights.
     */
    if (input?.historicalRecoverer) {
      probability += 0.20;
    }

    if (input?.serialFailer) {
      probability -= 0.20;
    }

    probability =
      this.clipProbability(probability);

    return {
      probability,
      confidence: 0.35,
      usedFallback: true,
    };
  }

  private isValidInput(
    input: LikelihoodInput
  ): boolean {
    if (!input) {
      return false;
    }

    if (
      !this.isValidDeclineCategory(
        input.declineCategory
      )
    ) {
      return false;
    }

    if (
      !this.isValidAction(
        input.action
      )
    ) {
      return false;
    }

    if (
      !["low", "medium", "high", "enterprise"]
        .includes(input.valueTier)
    ) {
      return false;
    }

    if (
      ![1, 2, 3].includes(
        input.attemptNumber
      )
    ) {
      return false;
    }

    if (
      !Number.isFinite(
        input.timeRemainingDays
      ) ||
      input.timeRemainingDays < 0
    ) {
      return false;
    }

    if (
      typeof input.historicalRecoverer !==
        "boolean" ||
      typeof input.serialFailer !==
        "boolean"
    ) {
      return false;
    }

    return true;
  }

  private isValidDeclineCategory(
    value: unknown
  ): value is DeclineCategory {
    return [
      "insufficient_funds",
      "bank_network_downtime",
      "expired_blocked_card",
      "customer_cancelled_mandate",
      "other_unclassified",
    ].includes(value as string);
  }

  private isValidAction(
    value: unknown
  ): value is ActionType {
    return [
      "retry_now",
      "retry_later",
      "notify_only",
      "escalate",
      "stop",
    ].includes(value as string);
  }

  private clipProbability(
    probability: number
  ): number {
    if (!Number.isFinite(probability)) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(1, probability)
    );
  }

  /**
   * Export the trained model as a versionable artifact.
   */
  exportModel() {
    if (this.weights.length === 0) {
      throw new Error(
        "Cannot export an untrained LikelihoodEstimator."
      );
    }

    return {
      modelType: "logistic_regression",
      modelVersion: "phase5-v1",
      weights: [...this.weights],
      bias: this.bias,
      featureCount: this.weights.length,
    };
  }

  static fromModel(model: {
    weights: number[];
    bias: number;
  }): LikelihoodEstimator {
    const estimator =
      new LikelihoodEstimator();

    estimator.weights = [
      ...model.weights,
    ];

    estimator.bias =
      model.bias;

    return estimator;
  }

  private encode(
    input: LikelihoodInput
  ): number[] {
    return [
      input.declineCategory ===
      "insufficient_funds"
        ? 1
        : 0,

      input.declineCategory ===
      "bank_network_downtime"
        ? 1
        : 0,

      input.declineCategory ===
      "expired_blocked_card"
        ? 1
        : 0,

      input.declineCategory ===
      "customer_cancelled_mandate"
        ? 1
        : 0,

      input.valueTier === "low"
        ? 1
        : 0,

      input.valueTier === "medium"
        ? 1
        : 0,

      input.valueTier === "high"
        ? 1
        : 0,

      input.attemptNumber,

      input.historicalRecoverer
        ? 1
        : 0,

      input.serialFailer
        ? 1
        : 0,

      input.timeRemainingDays,

      input.action === "retry_now"
        ? 1
        : 0,

      input.action === "retry_later"
        ? 1
        : 0,

      input.action === "notify_only"
        ? 1
        : 0,

      input.action === "escalate"
        ? 1
        : 0,
    ];
  }

  private sigmoid(x: number): number {
    if (x >= 0) {
      const z = Math.exp(-x);

      return 1 / (1 + z);
    }

    const z = Math.exp(x);

    return z / (1 + z);
  }

  private dot(
    a: number[],
    b: number[]
  ): number {
    let result = 0;

    for (
      let i = 0;
      i < a.length;
      i++
    ) {
      result +=
        a[i] * b[i];
    }

    return result;
  }
}
