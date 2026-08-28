import { ActionType } from "../config/modelingConfig";
import {
  DecisionState,
  StateManager,
} from "../state/stateManager";
import {
  DecisionRailPolicy,
  PolicyFilterResult,
} from "../policy/DecisionRailPolicy";

export interface ExecutionResult {
  decisionId: string;
  caseId: string;
  action: ActionType;
  previousState: DecisionState;
  finalState: DecisionState;
  executed: boolean;
  simulatedFailure: boolean;
  reason: string;
}

export interface ExecuteInput {
  decisionId: string;
  caseId: string;
  currentState: DecisionState;
  action: ActionType;
  policyResult: PolicyFilterResult;
  simulateFailure?: boolean;
}

export class ActionExecutor {
  private readonly policy: DecisionRailPolicy;
  private readonly stateManager: StateManager;

  private readonly executedDecisions =
    new Map<string, ExecutionResult>();

  constructor(
    policy = new DecisionRailPolicy(),
    stateManager = new StateManager()
  ) {
    this.policy = policy;
    this.stateManager = stateManager;
  }

  async execute(
    input: ExecuteInput
  ): Promise<ExecutionResult> {
    const {
      decisionId,
      caseId,
      currentState,
      action,
      policyResult,
      simulateFailure = false,
    } = input;

    // --------------------------------------------------
    // IDEMPOTENCY
    // --------------------------------------------------
    const previousExecution =
      this.executedDecisions.get(decisionId);

    if (previousExecution) {
      return {
        ...previousExecution,
        reason:
          "Idempotent execution: decision has already been executed.",
      };
    }

    // --------------------------------------------------
    // POLICY AUTHORIZATION
    // --------------------------------------------------
    if (!policyResult.policyAuthorized) {
      return {
        decisionId,
        caseId,
        action,
        previousState: currentState,
        finalState: currentState,
        executed: false,
        simulatedFailure: false,
        reason:
          "Execution blocked: policy is not authorized.",
      };
    }

    if (!this.policy.isAuthorized(action, policyResult)) {
      return {
        decisionId,
        caseId,
        action,
        previousState: currentState,
        finalState: currentState,
        executed: false,
        simulatedFailure: false,
        reason:
          "Execution blocked: action is not permitted by policy.",
      };
    }

    // --------------------------------------------------
    // HUMAN APPROVAL GATE
    // --------------------------------------------------
    if (policyResult.requiresHumanApproval) {
      return {
        decisionId,
        caseId,
        action,
        previousState: currentState,
        finalState: currentState,
        executed: false,
        simulatedFailure: false,
        reason:
          "Execution blocked: human approval is required.",
      };
    }

    // --------------------------------------------------
    // STOP
    // --------------------------------------------------
    if (action === "stop") {
      const finalState =
        await this.stateManager.transitionAndPersist(
          caseId,
          currentState,
          {
            type: "decision_computed",
            requiresHumanApproval: false,
            shouldStop: true,
          }
        );

      const result: ExecutionResult = {
        decisionId,
        caseId,
        action,
        previousState: currentState,
        finalState,
        executed: true,
        simulatedFailure: false,
        reason:
          "Decision executed: case stopped by policy.",
      };

      this.executedDecisions.set(
        decisionId,
        result
      );

      return result;
    }

    // --------------------------------------------------
    // ESCALATION
    // --------------------------------------------------
    if (action === "escalate") {
      return {
        decisionId,
        caseId,
        action,
        previousState: currentState,
        finalState: currentState,
        executed: false,
        simulatedFailure: false,
        reason:
          "Execution blocked: escalation requires the human approval flow.",
      };
    }

    // --------------------------------------------------
    // MOVE INTO RETRY SCHEDULED
    // --------------------------------------------------
    const scheduledState =
      await this.stateManager.transitionAndPersist(
        caseId,
        currentState,
        {
          type: "decision_computed",
          requiresHumanApproval: false,
          shouldStop: false,
        }
      );

    // --------------------------------------------------
    // SIMULATED EXECUTION FAILURE
    // --------------------------------------------------
    if (simulateFailure) {
      const revertedState =
        await this.stateManager.transitionAndPersist(
          caseId,
          scheduledState,
          {
            type: "action_failed",
            windowOpen: true,
          }
        );

      return {
        decisionId,
        caseId,
        action,
        previousState: currentState,
        finalState: revertedState,
        executed: false,
        simulatedFailure: true,
        reason:
          "Simulated execution failure: state reverted to pre-action state.",
      };
    }

    // --------------------------------------------------
    // SUCCESSFUL SIMULATED EXECUTION
    // --------------------------------------------------
    const result: ExecutionResult = {
      decisionId,
      caseId,
      action,
      previousState: currentState,
      finalState: scheduledState,
      executed: true,
      simulatedFailure: false,
      reason:
        "Simulated recovery action executed.",
    };

    this.executedDecisions.set(
      decisionId,
      result
    );

    return result;
  }
}