import { Schema, model } from "mongoose";
import { TrainingRow } from "../../generator/types";

const RetryHistorySchema = new Schema(
  { attemptNumber: Number, outcome: String },
  { _id: false }
);

const TrainingRowSchema = new Schema<TrainingRow>({
  caseId: { type: String, index: true },
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
  action: String,
  recovered: Boolean,
});

export const TrainingRowModel = model<TrainingRow>("TrainingRow", TrainingRowSchema);