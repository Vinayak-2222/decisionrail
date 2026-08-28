import {
  ACTION_MULTIPLIERS,
  BASE_PROPENSITY_BY_CATEGORY,
  DECLINE_REASON_DISTRIBUTION,
  HARD_SOFT_MAP,
  HISTORICAL_FLAG_PROPENSITY_SHIFT,
  HISTORICAL_FLAG_RATES,
  VALUE_TIERS,
  DeclineCategory,
} from "../config/modelingConfig";
import { CaseFeatures, PotentialOutcomesRecord, RetryHistoryEntry } from "./types";
import { Rng, clip01, sampleBeta, seededBernoulli, weightedChoice } from "./rng";
import { ActionType } from "../config/modelingConfig";

const ALL_ACTIONS: ActionType[] = ["retry_now", "retry_later", "notify_only", "escalate", "stop"];

function pickValueTier(rng: Rng): { tier: CaseFeatures["valueTier"]; arpu: number } {
  const weights = Object.fromEntries(
    Object.entries(VALUE_TIERS).map(([k, v]) => [k, v.weight])
  ) as Record<string, number>;
  const tier = weightedChoice(rng, weights) as CaseFeatures["valueTier"];
  const { minArpu, maxArpu } = VALUE_TIERS[tier];
  const arpu = Math.round(minArpu + rng() * (maxArpu - minArpu));
  return { tier, arpu };
}

function pickRetryHistory(rng: Rng): { attemptNumber: 1 | 2 | 3; history: RetryHistoryEntry[] } {
  const attemptNumber = (1 + Math.floor(rng() * 3)) as 1 | 2 | 3;
  const history: RetryHistoryEntry[] = [];
  for (let i = 1; i < attemptNumber; i++) {
    history.push({ attemptNumber: i, outcome: "failed" });
  }
  return { attemptNumber, history };
}

export function generateCaseFeatures(rng: Rng, caseId: string): CaseFeatures {
  const declineCategory = weightedChoice(rng, DECLINE_REASON_DISTRIBUTION) as DeclineCategory;
  const hardSoft = HARD_SOFT_MAP[declineCategory];
  const { tier, arpu } = pickValueTier(rng);
  const { attemptNumber, history } = pickRetryHistory(rng);
  const historicalRecoverer = rng() < HISTORICAL_FLAG_RATES.historicalRecoverer;
  const serialFailer = !historicalRecoverer && rng() < HISTORICAL_FLAG_RATES.serialFailer;
  // amount at risk this cycle: modeled as a fraction of ARPU with a bit of noise, never exceeding ARPU by much
  const amountAtRisk = Math.max(1, Math.round(arpu * (0.85 + rng() * 0.3)));
  const timeRemainingDays = Math.max(0, 3 - (attemptNumber - 1));

  return {
    caseId,
    declineCategory,
    hardSoft,
    valueTier: tier,
    arpu,
    amountAtRisk,
    attemptNumber,
    retryHistory: history,
    historicalRecoverer,
    serialFailer,
    timeRemainingDays,
  };
}

export function sampleLatentPropensity(rng: Rng, features: CaseFeatures): number {
  const { alpha, beta } = BASE_PROPENSITY_BY_CATEGORY[features.declineCategory];
  let p = sampleBeta(rng, alpha, beta);
  if (features.historicalRecoverer) p += HISTORICAL_FLAG_PROPENSITY_SHIFT.historicalRecoverer;
  if (features.serialFailer) p += HISTORICAL_FLAG_PROPENSITY_SHIFT.serialFailer;
  return clip01(p);
}

// Builds the FULL hidden potential-outcomes record for one case: every action, pre-committed.
// This function must only ever be called from generator/metrics code — never from the
// classifier/estimator/policy/executor modules.
export function buildPotentialOutcomes(
  features: CaseFeatures,
  latentPropensity: number
): PotentialOutcomesRecord {
  const multipliers = ACTION_MULTIPLIERS[features.declineCategory];
  const outcomes = {} as Record<ActionType, boolean>;
  for (const action of ALL_ACTIONS) {
    const pTrue = clip01(latentPropensity * multipliers[action]);
    outcomes[action] = seededBernoulli(features.caseId, action, pTrue);
  }
  return {
    caseId: features.caseId,
    latentPropensity,
    actionMultipliers: multipliers,
    outcomes,
  };
}

export const ALL_ACTION_TYPES = ALL_ACTIONS;