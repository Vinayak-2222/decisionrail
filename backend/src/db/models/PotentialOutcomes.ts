import { Schema, model } from "mongoose";
import { PotentialOutcomesRecord } from "../../generator/types";

const PotentialOutcomesSchema = new Schema<PotentialOutcomesRecord>({
  caseId: { type: String, unique: true, index: true },
  latentPropensity: Number,
  actionMultipliers: Schema.Types.Mixed,
  outcomes: Schema.Types.Mixed,
});

// Deliberately no export of a "find by caseId during decisioning" helper here —
// any module that wants this data has to import mongoose directly and go out of
// its way to do so, which is the point: nothing in the decision path should have
// a convenient path to this collection.
export const PotentialOutcomesModel = model<PotentialOutcomesRecord>(
  "PotentialOutcomes",
  PotentialOutcomesSchema
);