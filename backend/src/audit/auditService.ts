import {
  AuditRecordModel,
} from "../db/models/AuditRecord";

export interface CreateAuditInput {
  eventId: string;
  decisionId: string;
  caseId: string;

  inputSignals: {
    declineCategory: string;
    valueTier: string;
    retryCount: number;
    timeRemainingDays: number;
    amountAtRisk: number;
    historicalRecoverer: boolean;
    serialFailer: boolean;
  };

  likelihoods: Record<
    string,
    {
      probability: number;
      confidence: number;
    }
  >;

  evResults: Record<
    string,
    unknown
  >;

  chosenAction: string;

  policyChecks: Record<
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

  supersedes?: string;
}

export interface TimelineEvent {
  eventId: string;

  timestamp: Date;

  type:
    | "payment_failed"
    | "decision"
    | "human_review"
    | "action"
    | "outcome";

  title: string;

  description: string;

  actor?: string;

  action?: string;

  resultingState: string;

  recoveryOutcome?:
    | "pending"
    | "recovered"
    | "failed";

  recoveredAmount?: number;

  outcomeEvent?: string;
}

export interface SanitizedDecisionExplanation {
  decisionId: string;
  caseId: string;

  chosenAction: string;

  likelihoods: Record<
    string,
    {
      probability: number;
      confidence: number;
    }
  >;

  evResults: Record<
    string,
    unknown
  >;

  policyChecks: Record<
    string,
    unknown
  >;

  requiresHumanApproval: boolean;

  policyAuthorized: boolean;

  resultingState: string;

  modelVersion: string;

  policyVersion: string;

  costModelVersion: string;

  recoveryOutcome?:
    | "pending"
    | "recovered"
    | "failed";

  recoveredAmount?: number;

  outcomeAt?: Date;

  outcomeEvent?: string;

  timeline: TimelineEvent[];
}

export class AuditService {
  /**
   * Append-only audit insert.
   *
   * A decision/event pair can only be written once.
   */
  async recordDecision(
    input: CreateAuditInput
  ) {
    const existing =
      await AuditRecordModel.findOne({
        decisionId:
          input.decisionId,

        eventId:
          input.eventId,
      }).lean();

    if (existing) {
      return {
        created: false,
        duplicate: true,
        record: existing,
      };
    }

    const record =
      await AuditRecordModel.create(
        input
      );

    return {
      created: true,
      duplicate: false,
      record:
        record.toObject(),
    };
  }

  /**
   * Returns the original decision-created audit
   * record.
   */
  async getDecision(
    decisionId: string
  ) {
    return AuditRecordModel.findOne({
      decisionId,
      eventId:
        `${decisionId}-created`,
    }).lean();
  }

  /**
   * Returns the most recent audit event for
   * a decision.
   */
  async getLatestDecisionEvent(
    decisionId: string
  ) {
    return AuditRecordModel.findOne({
      decisionId,
    })
      .sort({
        timestamp: -1,
      })
      .lean();
  }

  /**
   * Returns the full append-only audit history
   * for a decision.
   */
  async getDecisionHistory(
    decisionId: string
  ) {
    return AuditRecordModel.find({
      decisionId,
    })
      .sort({
        timestamp: 1,
      })
      .lean();
  }

  /**
   * Convert persisted audit records into a
   * sanitized operational timeline.
   *
   * Raw audit records remain Admin-only.
   */
  private buildSanitizedTimeline(
    records: any[]
  ): TimelineEvent[] {
    return records
      .map(
        (
          record
        ): TimelineEvent | null => {
          const eventId =
            String(
              record.eventId ||
                ""
            );

          const policyChecks =
            record.policyChecks ||
            {};

          const executionResult =
            record.executionResult ||
            {};

          // --------------------------------------------
          // DECISION CREATED
          // --------------------------------------------

          if (
            eventId.endsWith(
              "-created"
            )
          ) {
            const source =
              typeof policyChecks.source ===
              "string"
                ? policyChecks.source
                : undefined;

            const razorpayEvent =
              typeof policyChecks.razorpayEvent ===
              "string"
                ? policyChecks.razorpayEvent
                : undefined;

            if (
              source ===
                "razorpay" ||
              razorpayEvent ===
                "payment.failed"
            ) {
              return {
                eventId,

                timestamp:
                  record.timestamp,

                type:
                  "payment_failed",

                title:
                  "Payment failed",

                description:
                  razorpayEvent ||
                  "Razorpay payment failure received.",

                resultingState:
                  record.resultingState,
              };
            }

            return {
              eventId,

              timestamp:
                record.timestamp,

              type:
                "decision",

              title:
                "Decision made",

              description:
                `Recommended action: ${record.chosenAction}.`,

              action:
                record.chosenAction,

              resultingState:
                record.resultingState,
            };
          }

          // --------------------------------------------
          // HUMAN APPROVAL / OVERRIDE / STOP
          // --------------------------------------------

          if (
            eventId.includes(
              "-human-"
            )
          ) {
            const humanAction =
              typeof policyChecks.humanAction ===
              "string"
                ? policyChecks.humanAction
                : undefined;

            const actorId =
              typeof policyChecks.actorId ===
              "string"
                ? policyChecks.actorId
                : undefined;

            const resolvedAction =
              typeof record.chosenAction ===
              "string"
                ? record.chosenAction
                : undefined;

            const description =
              resolvedAction
                ? `Human ${humanAction || "review"} resolved the case to ${resolvedAction}.`
                : `Human ${humanAction || "review"} was recorded.`;

            return {
              eventId,

              timestamp:
                record.timestamp,

              type:
                "human_review",

              title:
                "Human decision",

              description,

              actor:
                actorId,

              action:
                resolvedAction,

              resultingState:
                record.resultingState,
            };
          }

          // --------------------------------------------
          // AUTOMATIC EXECUTION
          // --------------------------------------------

          if (
            eventId.endsWith(
              "-executed"
            )
          ) {
            const executed =
              executionResult.executed;

            return {
              eventId,

              timestamp:
                record.timestamp,

              type:
                "action",

              title:
                "Recovery action",

              description:
                executed === false
                  ? `Action ${record.chosenAction} was not executed.`
                  : `Action ${record.chosenAction} executed.`,

              action:
                record.chosenAction,

              resultingState:
                record.resultingState,
            };
          }

          // --------------------------------------------
          // RAZORPAY OUTCOME
          // --------------------------------------------

          if (
            eventId.includes(
              "-outcome-"
            )
          ) {
            const recoveryOutcome =
              typeof policyChecks.recoveryOutcome ===
              "string"
                ? policyChecks.recoveryOutcome
                : undefined;

            const recoveredAmount =
              typeof policyChecks.recoveredAmount ===
              "number"
                ? policyChecks.recoveredAmount
                : undefined;

            const razorpayEvent =
              typeof policyChecks.razorpayEvent ===
              "string"
                ? policyChecks.razorpayEvent
                : undefined;

            let description =
              "Recovery outcome observed.";

            if (
              recoveryOutcome ===
              "recovered"
            ) {
              description =
                typeof recoveredAmount ===
                "number"
                  ? `Payment recovered: ₹${recoveredAmount}.`
                  : "Payment recovered.";
            } else if (
              recoveryOutcome ===
              "failed"
            ) {
              description =
                "Recovery attempt failed.";
            } else if (
              recoveryOutcome ===
              "pending"
            ) {
              description =
                "Recovery outcome is pending.";
            }

            return {
              eventId,

              timestamp:
                record.timestamp,

              type:
                "outcome",

              title:
                "Outcome observed",

              description,

              resultingState:
                record.resultingState,

              recoveryOutcome:
                recoveryOutcome as
                  | "pending"
                  | "recovered"
                  | "failed"
                  | undefined,

              recoveredAmount,

              outcomeEvent:
                razorpayEvent,
            };
          }

          return null;
        }
      )
      .filter(
        (
          event
        ): event is TimelineEvent =>
          event !== null
      );
  }

  /**
   * Returns the latest meaningful decision
   * explanation for the UI.
   *
   * The raw audit history remains private,
   * while a sanitized operational timeline is
   * included for RevOps.
   */
  async getSanitizedDecisionExplanation(
    decisionId: string
  ): Promise<
    SanitizedDecisionExplanation | null
  > {
    const history =
      await this.getDecisionHistory(
        decisionId
      );

    if (
      history.length === 0
    ) {
      return null;
    }

    const outcomeEvent =
      history
        .filter(
          (
            record
          ) =>
            String(
              record.eventId
            ).includes(
              "-outcome-"
            )
        )
        .sort(
          (a, b) =>
            new Date(
              b.timestamp
            ).getTime() -
            new Date(
              a.timestamp
            ).getTime()
        )[0];

    const executionEvent =
      history.find(
        (
          record
        ) =>
          String(
            record.eventId
          ) ===
          `${decisionId}-executed`
      );

    const createdEvent =
      history.find(
        (
          record
        ) =>
          String(
            record.eventId
          ) ===
          `${decisionId}-created`
      );

    const record =
      outcomeEvent ||
      executionEvent ||
      createdEvent;

    if (!record) {
      return null;
    }

    const outcomePolicyChecks =
      outcomeEvent?.policyChecks ||
      {};

    const timeline =
      this.buildSanitizedTimeline(
        history
      );

    return {
      decisionId:
        record.decisionId,

      caseId:
        record.caseId,

      chosenAction:
        record.chosenAction,

      likelihoods:
        record.likelihoods ||
        {},

      evResults:
        record.evResults ||
        {},

      policyChecks:
        record.policyChecks ||
        {},

      requiresHumanApproval:
        record.requiresHumanApproval,

      policyAuthorized:
        record.policyAuthorized,

      resultingState:
        record.resultingState,

      modelVersion:
        record.modelVersion,

      policyVersion:
        record.policyVersion,

      costModelVersion:
        record.costModelVersion,

      recoveryOutcome:
        outcomeEvent &&
        typeof outcomePolicyChecks.recoveryOutcome ===
          "string"
          ? (
              outcomePolicyChecks.recoveryOutcome as
                | "pending"
                | "recovered"
                | "failed"
            )
          : undefined,

      recoveredAmount:
        outcomeEvent &&
        typeof outcomePolicyChecks.recoveredAmount ===
          "number"
          ? outcomePolicyChecks.recoveredAmount
          : undefined,

      outcomeAt:
        outcomeEvent?.timestamp,

      outcomeEvent:
        outcomeEvent &&
        typeof outcomePolicyChecks.razorpayEvent ===
          "string"
          ? outcomePolicyChecks.razorpayEvent
          : undefined,

      timeline,
    };
  }
}