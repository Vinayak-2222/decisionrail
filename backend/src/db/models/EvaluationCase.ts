import { Schema, model } from "mongoose";
import { CaseFeatures } from "../../generator/types";

const RetryHistorySchema = new Schema(
  { attemptNumber: Number, outcome: String },
  { _id: false }
);

const EvaluationCaseSchema = new Schema<CaseFeatures>({
  caseId: { type: String, unique: true, index: true },
  declineCategory: String,
  hardSoft: String,
  valueTier: String,
  arpu: Number,
  amountAtRisk: Number,
  attemptNumber: Number,
  retryHistory: [RetryHistorySchema],
  historicalRecoverer: Boolean,
  serialFailer: Boolean,
  timeRemainingDays: Number,
  state: {
  type: String,
  enum: [
    "At Risk",
    "Awaiting Human Approval",
    "Retry Scheduled",
    "Recovered",
    "Escalated",
    "Stopped",
    "Halted",
  ],
  default: "At Risk",
},

fallback_active: {
  type: Boolean,
  default: false,
},
});

export const EvaluationCaseModel = model<CaseFeatures>("EvaluationCase", EvaluationCaseSchema);