import {
  ActionType,
  DeclineCategory,
  ValueTier,
} from "../config/modelingConfig";

export interface RetryHistoryEntry {
  attemptNumber: number;

  outcome: "failed";
  // by construction, retry history only records prior
  // FAILURES for an open case
}

export interface CaseFeatures {
  caseId: string;

  declineCategory: DeclineCategory;

  hardSoft:
    | "hard"
    | "soft"
    | "unknown";

  valueTier: ValueTier;

  arpu: number;

  amountAtRisk: number;
  // this cycle's failed charge amount —
  // the sole EV $ multiplier later

  attemptNumber: 1 | 2 | 3;

  retryHistory: RetryHistoryEntry[];

  historicalRecoverer: boolean;

  serialFailer: boolean;

  timeRemainingDays: number;

  state?:
    | "At Risk"
    | "Awaiting Human Approval"
    | "Retry Scheduled"
    | "Recovered"
    | "Escalated"
    | "Stopped"
    | "Halted";

  fallback_active?: boolean;
  // within the fixed 3-day dunning window

  // --------------------------------------------------
  // RAZORPAY RECOVERY LIFECYCLE
  // --------------------------------------------------

  razorpayPaymentId?: string;

  recoveryOutcome?:
    | "pending"
    | "recovered"
    | "failed";

  recoveredAmount?: number;

  outcomeAt?: Date;
}

// One row of the 5,000-row training corpus:
// a case's features, ONE action, ONE observed outcome.

export interface TrainingRow
  extends CaseFeatures {
  action: ActionType;

  recovered: boolean;
  // the label
}

// Hidden — never imported outside generator/metrics.
// Full potential-outcomes table for one eval case.

export interface PotentialOutcomesRecord {
  caseId: string;

  latentPropensity: number;
  // never exposed to estimator/EV/policy

  actionMultipliers:
    Record<ActionType, number>;

  outcomes:
    Record<ActionType, boolean>;
  // pre-computed for EVERY action,
  // before any policy runs
}