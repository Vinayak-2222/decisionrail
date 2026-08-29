import { Schema, model } from "mongoose";

const AuditRecordSchema = new Schema(
  {
    eventId: {
      type: String,
      required: true,
      index: true,
    },

    decisionId: {
      type: String,
      required: true,
      index: true,
    },

    caseId: {
      type: String,
      required: true,
      index: true,
    },

    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },

    inputSignals: {
      declineCategory: String,
      valueTier: String,
      retryCount: Number,
      timeRemainingDays: Number,
      amountAtRisk: Number,
      historicalRecoverer: Boolean,
      serialFailer: Boolean,
    },

    likelihoods: {
      type: Schema.Types.Mixed,
      required: true,
    },

    evResults: {
      type: Schema.Types.Mixed,
      required: true,
    },

    chosenAction: {
      type: String,
      required: true,
    },

    policyChecks: {
      type: Schema.Types.Mixed,
      required: true,
    },

    requiresHumanApproval: {
      type: Boolean,
      required: true,
    },

    policyAuthorized: {
      type: Boolean,
      required: true,
    },

    modelVersion: {
      type: String,
      required: true,
    },

    policyVersion: {
      type: String,
      required: true,
    },

    costModelVersion: {
      type: String,
      required: true,
    },

    executionResult: {
      type: Schema.Types.Mixed,
      required: false,
    },

    resultingState: {
      type: String,
      required: true,
    },

    supersedes: {
      type: String,
      required: false,
    },
  },
  {
    versionKey: false,
    strict: true,
  }
);

/*
 * Append-only guarantee:
 * this model intentionally exposes no application-level
 * update/delete methods. Corrections are new records using
 * `supersedes`.
 *
 * Idempotency guarantee:
 * the same decision/event pair can only exist once.
 * Multiple events for the same decision are still allowed.
 */
AuditRecordSchema.index(
  {
    decisionId: 1,
    eventId: 1,
  },
  {
    unique: true,
    name: "uniq_decision_event",
  }
);

export const AuditRecordModel = model(
  "AuditRecord",
  AuditRecordSchema
);