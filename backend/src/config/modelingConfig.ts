// ALL labeled modeling assumptions from Phase 5 live here, and only here.
// Anything that answers "what did you assume" in the demo should trace to this file.

export type DeclineCategory =
  | "insufficient_funds"       // soft
  | "bank_network_downtime"    // soft
  | "expired_blocked_card"     // hard
  | "customer_cancelled_mandate" // hard
  | "other_unclassified";      // unknown -> routes to human review downstream

export const HARD_SOFT_MAP: Record<DeclineCategory, "hard" | "soft" | "unknown"> = {
  insufficient_funds: "soft",
  bank_network_downtime: "soft",
  expired_blocked_card: "hard",
  customer_cancelled_mandate: "hard",
  other_unclassified: "unknown",
};

// [MODELING ASSUMPTION — configurable] Phase 5 Section 6
export const DECLINE_REASON_DISTRIBUTION: Record<DeclineCategory, number> = {
  insufficient_funds: 0.30,
  bank_network_downtime: 0.25,
  expired_blocked_card: 0.20,
  customer_cancelled_mandate: 0.10,
  other_unclassified: 0.15,
};

export type ValueTier = "low" | "medium" | "high" | "enterprise";

// [MODELING ASSUMPTION — configurable] Phase 5 Section 6
export const VALUE_TIERS: Record<ValueTier, { minArpu: number; maxArpu: number; weight: number }> = {
  low: { minArpu: 199, maxArpu: 499, weight: 0.50 },
  medium: { minArpu: 500, maxArpu: 1999, weight: 0.30 },
  high: { minArpu: 2000, maxArpu: 9999, weight: 0.15 },
  enterprise: { minArpu: 10000, maxArpu: 25000, weight: 0.05 },
};

// [MODELING ASSUMPTION — configurable] Phase 5 Section 6
export const HISTORICAL_FLAG_RATES = {
  historicalRecoverer: 0.15,
  serialFailer: 0.10,
};

export type ActionType = "retry_now" | "retry_later" | "notify_only" | "escalate" | "stop";

// [MODELING ASSUMPTION — configurable] Phase 5 Section 18 (illustrative units, not real Razorpay/ops costs)
export const ACTION_COSTS: Record<ActionType, number> = {
  retry_now: 2,
  retry_later: 2,
  notify_only: 5,
  escalate: 40,
  stop: 0,
};

// [MODELING ASSUMPTION — configurable] Phase 5 Section 19
export const POLICY_THRESHOLDS = {
  maxRetries: 3,
  contactCap: 2,
  highValueTierGate: ["high", "enterprise"] as ValueTier[],
  lowConfidenceThreshold: 0.55,
  tieMarginPct: 0.01, // Phase 5 Section 17: EVs within 1% of amount_at_risk => ambiguous
};

// [MODELING ASSUMPTION — configurable] Phase 5 Section 6
// Base latent recovery propensity by decline category, before historical-flag adjustment.
// Values are the mean of a Beta-shaped draw (alpha/beta chosen for a believable spread).
export const BASE_PROPENSITY_BY_CATEGORY: Record<DeclineCategory, { alpha: number; beta: number }> = {
  insufficient_funds: { alpha: 5, beta: 4 },      // soft, moderately recoverable, mean ~0.56
  bank_network_downtime: { alpha: 7, beta: 3 },   // soft, more recoverable, mean ~0.70
  expired_blocked_card: { alpha: 2, beta: 8 },    // hard, mean ~0.20
  customer_cancelled_mandate: { alpha: 1, beta: 9 }, // hard, mean ~0.10
  other_unclassified: { alpha: 3, beta: 5 },      // mean ~0.375
};

// Historical flags shift the Beta mean up/down (applied as an additive nudge, then clipped to [0,1])
export const HISTORICAL_FLAG_PROPENSITY_SHIFT = {
  historicalRecoverer: 0.20,
  serialFailer: -0.20,
};

// [MODELING ASSUMPTION — configurable] Phase 5 Section 6
// Per-action multiplier of latent propensity, by decline category. stop_multiplier is always 0
// (stopping never recovers anything — it's a deliberate floor, not a fitted value).
export const ACTION_MULTIPLIERS: Record<DeclineCategory, Record<ActionType, number>> = {
  insufficient_funds: { retry_now: 0.9, retry_later: 1.0, notify_only: 0.6, escalate: 1.15, stop: 0 },
  bank_network_downtime: { retry_now: 1.05, retry_later: 1.0, notify_only: 0.5, escalate: 1.0, stop: 0 },
  expired_blocked_card: { retry_now: 0.15, retry_later: 0.15, notify_only: 0.35, escalate: 0.5, stop: 0 },
  customer_cancelled_mandate: { retry_now: 0.05, retry_later: 0.05, notify_only: 0.2, escalate: 0.3, stop: 0 },
  other_unclassified: { retry_now: 0.6, retry_later: 0.6, notify_only: 0.5, escalate: 0.8, stop: 0 },
};

export const DATASET_SIZES = {
  trainingCorpusSize: 5000,
  evaluationBatchSize: 200,
  validationSplitPct: 0.15, // held out from the training corpus, used only for calibration check
};

// Separate seeds so training and evaluation are never accidentally the same draw (Phase 5 Section 6/70)
export const GENERATION_SEEDS = {
  trainingSeed: 20260901,
  evaluationSeed: 20260902,
};

export const CONFIG_VERSION = "phase5-v1";