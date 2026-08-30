import { ActionType } from "../config/modelingConfig";
import { EvaluationCaseModel } from "../db/models/EvaluationCase";

export type DecisionState =
  | "At Risk"
  | "Awaiting Human Approval"
  | "Retry Scheduled"
  | "Recovered"
  | "Escalated"
  | "Stopped"
  | "Halted";

export type StateEvent =
  | {
      type: "decision_computed";
      requiresHumanApproval: boolean;
      shouldStop: boolean;
    }
  | {
      type: "action_recovered";
    }
  | {
      type: "action_failed";
      windowOpen: boolean;
    }
  | {
      type: "payment_recovered";
    }
  | {
      type: "payment_failed";
      windowOpen: boolean;
    }
  | {
      type: "human_approved";
      action: ActionType;
    }
  | {
      type: "human_overridden";
      action: ActionType;
    }
  | {
      type: "human_stopped";
    }
  | {
      type: "human_resolved_escalation";
      recovered: boolean;
    }
  | {
      type: "window_expired";
    };

const TERMINAL_STATES: DecisionState[] = [
  "Recovered",
  "Stopped",
  "Halted",
];

export class StateManager {
  canTransition(
    from: DecisionState,
    event: StateEvent
  ): boolean {
    return this.getNextState(from, event) !== null;
  }

  getNextState(
    from: DecisionState,
    event: StateEvent
  ): DecisionState | null {
    if (TERMINAL_STATES.includes(from)) {
      return null;
    }

    if (event.type === "window_expired") {
      return "Halted";
    }

    switch (from) {
      case "At Risk":
        if (event.type === "payment_recovered") {
          return "Recovered";
        }

        if (event.type !== "decision_computed") {
          return null;
        }

        if (event.shouldStop) {
          return "Stopped";
        }

        if (event.requiresHumanApproval) {
          return "Awaiting Human Approval";
        }

        return "Retry Scheduled";

      case "Retry Scheduled":
        if (
          event.type === "action_recovered" ||
          event.type === "payment_recovered"
        ) {
          return "Recovered";
        }

        if (
          event.type === "action_failed" ||
          event.type === "payment_failed"
        ) {
          return event.windowOpen
            ? "At Risk"
            : "Halted";
        }

        return null;

      case "Awaiting Human Approval":
        if (event.type === "payment_recovered") {
          return "Recovered";
        }

        if (
          event.type === "human_approved" ||
          event.type === "human_overridden"
        ) {
          if (event.action === "stop") {
            return "Stopped";
          }

          if (event.action === "escalate") {
            return "Escalated";
          }

          return "Retry Scheduled";
        }

        if (event.type === "human_stopped") {
          return "Stopped";
        }

        return null;

      case "Escalated":
        if (event.type === "payment_recovered") {
          return "Recovered";
        }

        if (event.type === "human_resolved_escalation") {
          return event.recovered
            ? "Recovered"
            : "Stopped";
        }

        return null;

      default:
        return null;
    }
  }

  transition(
    currentState: DecisionState,
    event: StateEvent
  ): DecisionState {
    const nextState = this.getNextState(
      currentState,
      event
    );

    if (!nextState) {
      throw new Error(
        `Invalid state transition: ${currentState} -> ${event.type}`
      );
    }

    return nextState;
  }

  /**
   * Persist a valid state transition for a case.
   */
  async transitionAndPersist(
    caseId: string,
    currentState: DecisionState,
    event: StateEvent
  ): Promise<DecisionState> {
    const nextState = this.transition(
      currentState,
      event
    );

    const updatedCase =
      await EvaluationCaseModel.findOneAndUpdate(
        {
          caseId,
          state: currentState,
        },
        {
          $set: {
            state: nextState,
          },
        },
        {
          new: true,
        }
      ).lean();

    if (!updatedCase) {
      throw new Error(
        `State persistence failed or state changed concurrently for case ${caseId}`
      );
    }

    return nextState;
  }
}