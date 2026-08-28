import {
  DeclineCategory,
  ValueTier,
} from "../config/modelingConfig";

import {
  RetryHistoryEntry,
  CaseFeatures,
} from "../generator/types";

import {
  classifyDecline,
  HardSoft,
} from "../classifier/declineClassifier";

export interface CaseContext {
  caseId: string;
  declineCategory: DeclineCategory;
  hardSoft: HardSoft;
  valueTier: ValueTier;
  amountAtRisk: number;
  attemptNumber: 1 | 2 | 3;
  retryHistory: RetryHistoryEntry[];
  timeRemainingDays: number;
  historicalRecoverer: boolean;
  serialFailer: boolean;
  
}

export function buildCaseContext(
  inputCase: CaseFeatures
): CaseContext {
  return {
    caseId: inputCase.caseId,
    declineCategory: inputCase.declineCategory,
    hardSoft: classifyDecline(inputCase.declineCategory),
    valueTier: inputCase.valueTier,
    amountAtRisk: inputCase.amountAtRisk,
    attemptNumber: inputCase.attemptNumber,
    retryHistory: inputCase.retryHistory,
    timeRemainingDays: inputCase.timeRemainingDays,
    historicalRecoverer: inputCase.historicalRecoverer,
    serialFailer: inputCase.serialFailer,
  };
}

