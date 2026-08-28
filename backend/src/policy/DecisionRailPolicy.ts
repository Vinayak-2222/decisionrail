import {
  ActionType,
  POLICY_THRESHOLDS,
} from "../config/modelingConfig";

import { CaseContext } from "../context/contextBuilder";

export interface PolicyFilterResult {
  permittedActions: ActionType[];

  retryLimitReached: boolean;
  contactCapReached: boolean;
  hardDecline: boolean;

  requiresHumanApproval: boolean;

  highValueFlag: boolean;
  lowConfidenceFlag: boolean;
  tieFlag: boolean;
  escalationFlag: boolean;

  policyAuthorized: boolean;

  reasons: string[];
}

export interface PolicyDecisionInput {
  context: CaseContext;

  /**
   * Confidence is supplied by the Likelihood Estimator.
   * Policy does not calculate confidence itself.
   */
  confidenceByAction: Record<ActionType, number>;

  /**
   * Tie information is supplied after EV comparison.
   */
  tieDetected?: boolean;
}

const ALL_ACTIONS: ActionType[] = [
  "retry_now",
  "retry_later",
  "notify_only",
  "escalate",
  "stop",
];

export class DecisionRailPolicy {
  /**
   * Phase 5 Section 19:
   *
   * Hard policy filtering happens BEFORE EV comparison.
   */
  filterCandidates(
    context: CaseContext
  ): PolicyFilterResult {
    let permittedActions: ActionType[] = [
      ...ALL_ACTIONS,
    ];

    const reasons: string[] = [];

    const retryLimitReached =
      context.attemptNumber >=
      POLICY_THRESHOLDS.maxRetries;

    const contactCount =
      context.retryHistory.length;

    const contactCapReached =
      contactCount >=
      POLICY_THRESHOLDS.contactCap;

    const hardDecline =
      context.hardSoft === "hard";

    // --------------------------------------------------
    // HARD DECLINE
    // --------------------------------------------------

    if (hardDecline) {
      permittedActions = ["stop"];

      reasons.push(
        "Hard decline: all recovery actions filtered; stop only."
      );
    } else {
      // ------------------------------------------------
      // MAX RETRY COUNT
      // ------------------------------------------------

      if (retryLimitReached) {
        permittedActions =
          permittedActions.filter(
            (action) =>
              action !== "retry_now" &&
              action !== "retry_later"
          );

        reasons.push(
          "Maximum retry count reached: retry actions filtered."
        );
      }

      // ------------------------------------------------
      // CONTACT CAP
      // ------------------------------------------------

      if (contactCapReached) {
        permittedActions =
          permittedActions.filter(
            (action) =>
              action !== "notify_only"
          );

        reasons.push(
          "Contact frequency cap reached: notify-only filtered."
        );
      }
    }

    return {
      permittedActions,

      retryLimitReached,
      contactCapReached,
      hardDecline,

      requiresHumanApproval: false,

      highValueFlag: false,
      lowConfidenceFlag: false,
      tieFlag: false,
      escalationFlag: false,

      policyAuthorized:
        permittedActions.length > 0,

      reasons,
    };
  }

  /**
   * Applies post-EV approval gates.
   *
   * High-value, low-confidence, tie, and escalation
   * decisions require human approval.
   */
  evaluateApprovalGates(
    filtered: PolicyFilterResult,
    context: CaseContext,
    winningAction: ActionType,
    confidenceByAction: Record<ActionType, number>,
    tieDetected = false
  ): PolicyFilterResult {
    const result: PolicyFilterResult = {
      ...filtered,
      reasons: [...filtered.reasons],
    };

    // --------------------------------------------------
    // HIGH-VALUE GATE
    // --------------------------------------------------

    const highValueFlag =
      POLICY_THRESHOLDS.highValueTierGate.includes(
        context.valueTier
      );

    if (highValueFlag) {
      result.highValueFlag = true;

      result.reasons.push(
        `High-value tier (${context.valueTier}) requires human approval.`
      );
    }

    // --------------------------------------------------
    // LOW-CONFIDENCE GATE
    // --------------------------------------------------

    const winningConfidence =
      confidenceByAction[winningAction];

    const lowConfidenceFlag =
      typeof winningConfidence !== "number" ||
      winningConfidence <
        POLICY_THRESHOLDS.lowConfidenceThreshold;

    if (lowConfidenceFlag) {
      result.lowConfidenceFlag = true;

      result.reasons.push(
        "Winning action has low confidence and requires human approval."
      );
    }

    // --------------------------------------------------
    // TIE GATE
    // --------------------------------------------------

    if (tieDetected) {
      result.tieFlag = true;

      result.reasons.push(
        "Expected-value tie detected: human approval required."
      );
    }

    // --------------------------------------------------
    // ESCALATION GATE
    // --------------------------------------------------
    //
    // Escalation is a human-in-the-loop action.
    // It must never be autonomously executed.
    // --------------------------------------------------

    const escalationFlag =
      winningAction === "escalate";

    if (escalationFlag) {
      result.escalationFlag = true;

      result.reasons.push(
        "Escalation selected: human approval required."
      );
    }

    // --------------------------------------------------
    // FINAL APPROVAL DECISION
    // --------------------------------------------------

    result.requiresHumanApproval =
      result.highValueFlag ||
      result.lowConfidenceFlag ||
      result.tieFlag ||
      result.escalationFlag;

    return result;
  }

  /**
   * Returns whether an action remains authorized
   * by the hard policy filter.
   *
   * The Executor uses this as its safety boundary.
   */
  isAuthorized(
    action: ActionType,
    filtered: PolicyFilterResult
  ): boolean {
    return (
      filtered.policyAuthorized &&
      filtered.permittedActions.includes(action)
    );
  }
}