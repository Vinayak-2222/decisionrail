export type Role =
  | "RevOps"
  | "Admin";

export type ActionType =
  | "retry_now"
  | "retry_later"
  | "notify_only"
  | "escalate"
  | "stop";

export type CaseState =
  | "At Risk"
  | "Awaiting Human Approval"
  | "Retry Scheduled"
  | "Recovered"
  | "Escalated"
  | "Stopped"
  | "Halted"
  | string;

export interface User {
  userId: string;
  role: Role;
}

export interface LoginResponse {
  sessionId: string;
  user: User;
  message: string;
}

export interface RetryHistoryEntry {
  attemptNumber: number;
  outcome: string;
}

export interface EvaluationCase {
  caseId: string;
  declineCategory: string;
  hardSoft: string;
  valueTier: string;
  arpu?: number;
  amountAtRisk: number;
  attemptNumber: number;
  retryHistory?: RetryHistoryEntry[];
  historicalRecoverer: boolean;
  serialFailer: boolean;
  timeRemainingDays: number;
  fallback_active?: boolean;
  state: CaseState;

  razorpayPaymentId?: string;

  recoveryOutcome?:
    | "pending"
    | "recovered"
    | "failed";

  recoveredAmount?: number;

  outcomeAt?: string;
}

export interface CasesResponse {
  count: number;
  cases: EvaluationCase[];
}

export interface CaseDetailResponse {
  case: EvaluationCase;
}

export interface LikelihoodResult {
  probability: number;
  confidence: number;
}

export interface DecisionAudit {
  _id?: string;

  eventId: string;
  decisionId: string;
  caseId: string;

  inputSignals?: Record<
    string,
    unknown
  >;

  likelihoods?: Record<
    string,
    LikelihoodResult
  >;

  evResults?: Record<
    string,
    number
  >;

  chosenAction: ActionType;

  policyChecks?: Record<
    string,
    unknown
  >;

  requiresHumanApproval: boolean;
  policyAuthorized: boolean;

  modelVersion: string;
  policyVersion: string;
  costModelVersion: string;

  executionResult?: Record<
    string,
    unknown
  >;

  resultingState: string;

  recoveryOutcome?:
    | "pending"
    | "recovered"
    | "failed";

  recoveredAmount?: number;

  outcomeAt?: string;

  outcomeEvent?: string;

  timestamp?: string;
  supersedes?: string;
}

export interface AuditResponse {
  decisionId: string;
  count: number;
  records: DecisionAudit[];
}

export interface ApprovalResponse {
  success: boolean;
  decisionId: string;
  caseId: string;
  actorId: string;
  role: Role;

  action:
    | "approve"
    | "override"
    | "stop";

  previousState: string;
  resultingState: string;

  resolvedAction?: ActionType;

  reason: string;
}

export interface PolicyMetrics {
  recoveredAmount: number;
  recoveredCases: number;
  recoveryRate: number;
  totalAmountAtRisk: number;
  selectedCases: number;
  executedCases: number;
  retryCases: number;
  stopCases: number;
  escalationCases: number;
}

export interface ExperimentMetrics {
  batchSize: number;
  sameBatchVerified: boolean;
  sameHiddenOutcomesVerified: boolean;

  decisionRail: PolicyMetrics;
  baseline: PolicyMetrics;

  incrementalRecoveredAmount: number;

  recoveryRateImprovementPercentagePoints: number;

  relativeRecoveredAmountImprovementPercent: number;

  wastedRetriesAvoided: number;

  highValueAccountsSaved: number;

  unnecessaryWriteOffRate: number;

  baselineUnnecessaryWriteOffRate: number;

  falseEscalationRate:
    | number
    | null;

  falseEscalationRateAvailable: boolean;

  falseEscalationRateReason: string;

  decisionRailDecisionAuditRecords: number;

  decisionRailExecutionAuditRecords: number;

  humanResolutionAuditRecords: number;

  syntheticTestMode: boolean;

  notes: string[];
}