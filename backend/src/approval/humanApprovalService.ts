import {
  ActionType,
} from "../config/modelingConfig";

import {
  EvaluationCaseModel,
} from "../db/models/EvaluationCase";

import {
  AuditService,
} from "../audit/auditService";

import {
  StateManager,
} from "../state/stateManager";

export type ApprovalAction =
  | "approve"
  | "override"
  | "stop";

export interface ApprovalRequest {
  decisionId: string;
  caseId: string;

  actorId: string;

  role:
    | "RevOps"
    | "Admin";

  action:
    ApprovalAction;

  /*
   * Required only when action = override.
   */
  overrideAction?:
    ActionType;
}

export interface ApprovalResult {
  success: boolean;

  decisionId: string;
  caseId: string;

  actorId: string;

  role:
    | "RevOps"
    | "Admin";

  action:
    ApprovalAction;

  previousState: string;

  resultingState: string;

  resolvedAction?:
    ActionType;

  reason: string;
}

export class HumanApprovalService {
  private readonly stateManager:
    StateManager;

  private readonly auditService:
    AuditService;

  constructor(
    stateManager =
      new StateManager(),

    auditService =
      new AuditService()
  ) {
    this.stateManager =
      stateManager;

    this.auditService =
      auditService;
  }

  async resolve(
    request: ApprovalRequest
  ): Promise<ApprovalResult> {
    // --------------------------------------------------
    // VALIDATION
    // --------------------------------------------------

    if (
      !request.actorId ||
      !request.actorId.trim()
    ) {
      throw new Error(
        "actorId is required."
      );
    }

    if (
      !request.caseId ||
      !request.caseId.trim()
    ) {
      throw new Error(
        "caseId is required."
      );
    }

    if (
      !request.decisionId ||
      !request.decisionId.trim()
    ) {
      throw new Error(
        "decisionId is required."
      );
    }

    if (
      request.action ===
        "override" &&
      !request.overrideAction
    ) {
      throw new Error(
        "overrideAction is required for an override."
      );
    }

    // --------------------------------------------------
    // LOAD CURRENT CASE
    // --------------------------------------------------

    const currentCase =
      await EvaluationCaseModel
        .findOne({
          caseId:
            request.caseId,
        })
        .lean();

    if (!currentCase) {
      throw new Error(
        `Case not found: ${request.caseId}`
      );
    }

    const currentState =
      currentCase.state ||
      "At Risk";

    // --------------------------------------------------
    // ONLY HUMAN-APPROVAL CASES
    // --------------------------------------------------

    if (
      currentState !==
      "Awaiting Human Approval"
    ) {
      return {
        success: false,

        decisionId:
          request.decisionId,

        caseId:
          request.caseId,

        actorId:
          request.actorId,

        role:
          request.role,

        action:
          request.action,

        previousState:
          currentState,

        resultingState:
          currentState,

        reason:
          `Decision cannot be resolved because current state is ${currentState}.`,
      };
    }

    // --------------------------------------------------
    // LOAD ORIGINAL DECISION
    //
    // This is required for APPROVE because approval
    // means "approve the original chosen action".
    // --------------------------------------------------

    let originalAction:
      ActionType |
      undefined;

    if (
      request.action ===
      "approve"
    ) {
      const originalDecision =
        await this.auditService
          .getDecision(
            request.decisionId
          );

      if (!originalDecision) {
        throw new Error(
          `Decision not found in audit: ${request.decisionId}`
        );
      }

      originalAction =
        originalDecision
          .chosenAction as ActionType;
    }

    // --------------------------------------------------
    // DETERMINE RESOLUTION
    // --------------------------------------------------

    let resolvedAction:
      ActionType |
      undefined;

    let nextState:
      | "Retry Scheduled"
      | "Escalated"
      | "Stopped";

    if (
      request.action ===
      "approve"
    ) {
      resolvedAction =
        originalAction!;

      if (
        resolvedAction ===
        "stop"
      ) {
        nextState =
          "Stopped";
      } else if (
        resolvedAction ===
        "escalate"
      ) {
        nextState =
          "Escalated";
      } else {
        nextState =
          "Retry Scheduled";
      }
    } else if (
      request.action ===
      "override"
    ) {
      resolvedAction =
        request.overrideAction!;

      if (
        resolvedAction ===
        "stop"
      ) {
        nextState =
          "Stopped";
      } else if (
        resolvedAction ===
        "escalate"
      ) {
        nextState =
          "Escalated";
      } else {
        nextState =
          "Retry Scheduled";
      }
    } else {
      resolvedAction =
        "stop";

      nextState =
        "Stopped";
    }

    // --------------------------------------------------
    // STATE TRANSITION VALIDATION
    //
    // Keep the StateManager as the source of truth
    // for legal human transitions.
    // --------------------------------------------------

    let stateEvent:
      | {
          type:
            "human_approved";

          action:
            ActionType;
        }
      | {
          type:
            "human_overridden";

          action:
            ActionType;
        }
      | {
          type:
            "human_stopped";
        };

    if (
      request.action ===
      "approve"
    ) {
      stateEvent = {
        type:
          "human_approved",

        action:
          resolvedAction!,
      };
    } else if (
      request.action ===
      "override"
    ) {
      stateEvent = {
        type:
          "human_overridden",

        action:
          resolvedAction!,
      };
    } else {
      stateEvent = {
        type:
          "human_stopped",
      };
    }

    const expectedState =
      this.stateManager.getNextState(
        "Awaiting Human Approval",
        stateEvent
      );

    if (
      expectedState === null
    ) {
      throw new Error(
        `Invalid human approval transition for action ${request.action}.`
      );
    }

    // --------------------------------------------------
    // COMPARE-AND-SWAP
    //
    // First successful writer wins.
    // --------------------------------------------------

    const updated =
      await EvaluationCaseModel.updateOne(
        {
          caseId:
            request.caseId,

          state:
            "Awaiting Human Approval",
        },
        {
          $set: {
            state:
              expectedState,
          },
        }
      );

    if (
      updated.modifiedCount !== 1
    ) {
      return {
        success: false,

        decisionId:
          request.decisionId,

        caseId:
          request.caseId,

        actorId:
          request.actorId,

        role:
          request.role,

        action:
          request.action,

        previousState:
          "Awaiting Human Approval",

        resultingState:
          "Awaiting Human Approval",

        resolvedAction,

        reason:
          "Decision was already resolved by another actor.",
      };
    }

    // --------------------------------------------------
    // HUMAN RESOLUTION AUDIT
    // --------------------------------------------------
    //
    // This explicitly records the human outcome.
    // Metrics can later use these fields to calculate
    // false/unnecessary escalation rates.
    // --------------------------------------------------

    const humanEventId =
      `${request.decisionId}-human-${request.action}`;

    const auditResult =
      await this.auditService.recordDecision({
        eventId:
          humanEventId,

        decisionId:
          request.decisionId,

        caseId:
          request.caseId,

        inputSignals: {
          declineCategory:
            String(
              currentCase.declineCategory
            ),

          valueTier:
            String(
              currentCase.valueTier
            ),

          retryCount:
            Number(
              currentCase.attemptNumber
            ),

          timeRemainingDays:
            Number(
              currentCase.timeRemainingDays
            ),

          amountAtRisk:
            Number(
              currentCase.amountAtRisk
            ),

          historicalRecoverer:
            Boolean(
              currentCase.historicalRecoverer
            ),

          serialFailer:
            Boolean(
              currentCase.serialFailer
            ),
        },

        likelihoods:
          {},

        evResults:
          {},

        /*
         * Keep the resolved action explicit.
         */
        chosenAction:
          resolvedAction!,

        policyChecks: {
          humanAction:
            request.action,

          humanResolution:
            request.action,

          actorId:
            request.actorId,

          role:
            request.role,

          originalAction:
            originalAction ||
            null,

          overrideAction:
            request.overrideAction ||
            null,

          previousState:
            "Awaiting Human Approval",

          resultingState:
            expectedState,
        },

        requiresHumanApproval:
          false,

        policyAuthorized:
          true,

        modelVersion:
          "phase5-v1",

        policyVersion:
          "phase5-v1",

        costModelVersion:
          "phase5-v1",

        executionResult: {
          humanAction:
            request.action,

          humanResolution:
            request.action,

          actorId:
            request.actorId,

          role:
            request.role,

          resolvedAction:
            resolvedAction!,

          /*
           * This flag is what a later Metrics Service
           * can use when evaluating whether an
           * escalation was unnecessary.
           *
           * It is deliberately false until a human
           * explicitly marks an escalation unnecessary.
           */
          escalationNecessary:
            request.action ===
              "approve" &&
            (
              originalAction ===
              "escalate"
            )
              ? true
              : null,
        },

        resultingState:
          expectedState,

        supersedes:
          `${request.decisionId}-created`,
      });

    return {
      success: true,

      decisionId:
        request.decisionId,

      caseId:
        request.caseId,

      actorId:
        request.actorId,

      role:
        request.role,

      action:
        request.action,

      previousState:
        "Awaiting Human Approval",

      resultingState:
        expectedState,

      resolvedAction,

      reason:
        auditResult.created
          ? `Human ${request.action} applied successfully.`
          : `Human ${request.action} was already audited.`,
    };
  }
}