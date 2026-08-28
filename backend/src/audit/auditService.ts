import { AuditRecordModel } from "../db/models/AuditRecord";

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

  evResults: Record<string, unknown>;

  chosenAction: string;

  policyChecks: Record<string, unknown>;

  requiresHumanApproval: boolean;
  policyAuthorized: boolean;

  modelVersion: string;
  policyVersion: string;
  costModelVersion: string;

  executionResult?: Record<string, unknown>;

  resultingState: string;

  supersedes?: string;
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

  evResults: Record<string, unknown>;

  policyChecks: Record<string, unknown>;

  requiresHumanApproval: boolean;

  policyAuthorized: boolean;

  resultingState: string;

  modelVersion: string;

  policyVersion: string;

  costModelVersion: string;
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
        decisionId: input.decisionId,

        eventId: input.eventId,
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
    })
      .lean();
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
   * Returns only decision-explanation fields.
   *
   * This is intentionally sanitized for the
   * operational Decision Experience. It does not
   * expose the complete raw audit document.
   */
  async getSanitizedDecisionExplanation(
    decisionId: string
  ): Promise<
    SanitizedDecisionExplanation | null
  > {
    const record =
      await AuditRecordModel.findOne({
        decisionId,

        eventId:
          `${decisionId}-created`,
      })
        .select({
          _id: 0,

          decisionId: 1,
          caseId: 1,

          likelihoods: 1,
          evResults: 1,

          chosenAction: 1,

          policyChecks: 1,

          requiresHumanApproval: 1,

          policyAuthorized: 1,

          modelVersion: 1,

          policyVersion: 1,

          costModelVersion: 1,

          resultingState: 1,
        })
        .lean();

    if (!record) {
      return null;
    }

    return {
      decisionId:
        record.decisionId,

      caseId:
        record.caseId,

      chosenAction:
        record.chosenAction,

      likelihoods:
        record.likelihoods || {},

      evResults:
        record.evResults || {},

      policyChecks:
        record.policyChecks || {},

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
    };
  }
}