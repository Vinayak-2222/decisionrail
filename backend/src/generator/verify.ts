import "dotenv/config";
import { connectMongo, disconnectMongo } from "../db/mongoClient";
import { TrainingRowModel } from "../db/models/TrainingRow";
import { EvaluationCaseModel } from "../db/models/EvaluationCase";
import { PotentialOutcomesModel } from "../db/models/PotentialOutcomes";

async function pctBreakdown(model: any, field: string) {
  const agg = await model.aggregate([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }]);
  const total = agg.reduce((s: number, r: any) => s + r.count, 0);
  return agg
    .map((r: any) => `${r._id}: ${((r.count / total) * 100).toFixed(1)}%`)
    .join(", ");
}

async function main() {
  await connectMongo();

  const trainingCount = await TrainingRowModel.countDocuments();
  const evalCount = await EvaluationCaseModel.countDocuments();
  const outcomesCount = await PotentialOutcomesModel.countDocuments();

  console.log(`\n=== COUNTS ===`);
  console.log(`training rows: ${trainingCount} (expect 5000)`);
  console.log(`eval cases: ${evalCount} (expect 200)`);
  console.log(`hidden outcome records: ${outcomesCount} (expect 200 — one per eval case)`);

  console.log(`\n=== TRAINING CORPUS distribution (should roughly match config) ===`);
  console.log(`decline category: ${await pctBreakdown(TrainingRowModel, "declineCategory")}`);
  console.log(`value tier:       ${await pctBreakdown(TrainingRowModel, "valueTier")}`);

  console.log(`\n=== EVAL BATCH distribution ===`);
  console.log(`decline category: ${await pctBreakdown(EvaluationCaseModel, "declineCategory")}`);
  console.log(`value tier:       ${await pctBreakdown(EvaluationCaseModel, "valueTier")}`);

  console.log(`\n=== SAMPLE EVAL CASES (spot-check by eye) ===`);
  const sample = await EvaluationCaseModel.find().limit(3).lean();
  console.log(JSON.stringify(sample, null, 2));

  console.log(`\n=== SAMPLE HIDDEN OUTCOME RECORD (exists, and you can see it here — but no other module imports this model) ===`);
  const outcomeSample = await PotentialOutcomesModel.findOne().lean();
  console.log(JSON.stringify(outcomeSample, null, 2));

  await disconnectMongo();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});