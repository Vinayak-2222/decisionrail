import { ActionType, POLICY_THRESHOLDS } from "../config/modelingConfig";
import { CaseContext } from "../context/contextBuilder";

export interface RecoveryPolicy {
  decide(context: CaseContext): ActionType;
}

export class BaselinePolicy implements RecoveryPolicy {
  decide(context: CaseContext): ActionType {
    if (context.timeRemainingDays <= 0) {
      return "stop";
    }

    if (context.attemptNumber >= POLICY_THRESHOLDS.maxRetries) {
      return "stop";
    }

    return "retry_later";
  }
}