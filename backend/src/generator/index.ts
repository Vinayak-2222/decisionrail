import "dotenv/config";
import { connectMongo, disconnectMongo } from "../db/mongoClient";
import { TrainingRowModel } from "../db/models/TrainingRow";
import { EvaluationCaseModel } from "../db/models/EvaluationCase";
import { PotentialOutcomesModel } from "../db/models/PotentialOutcomes";
import { ALL_ACTION_TYPES, buildPotentialOutcomes, generateCaseFeatures, sampleLatentPropensity } from "./caseFactory";
import { mulberry32, weightedChoice } from "./rng";
import { CONFIG_VERSION, DATASET_SIZES, GENERATION_SEEDS } from "../config/modelingConfig";
import { TrainingRow } from "./types";

async function generateTrainingCorpus(): Promise<TrainingRow[]> {
  const rng = mulberry32(GENERATION_SEEDS.trainingSeed);
  const rows: TrainingRow[] = [];

  for (let i = 0; i < DATASET_SIZES.trainingCorpusSize; i++) {
    const caseId = `train-${i.toString().padStart(5, "0")}`;
    const features = generateCaseFeatures(rng, caseId);
    const latentPropensity = sampleLatentPropensity(rng, features);
    const potentialOutcomes = buildPotentialOutcomes(features, latentPropensity);

    // Training rows observe exactly ONE (context, action) -> outcome pair each, like a real
    // system would only ever see the outcome of the action actually taken.
    const action = ALL_ACTION_TYPES[Math.floor(rng() * ALL_ACTION_TYPES.length)];
    rows.push({ ...features, action, recovered: potentialOutcomes.outcomes[action] });
  }
  return rows;
}

async function generateEvaluationBatch() {
  const rng = mulberry32(GENERATION_SEEDS.evaluationSeed); // DIFFERENT seed than training — Phase 5 Section 6/70
  const cases = [];
  const potentialOutcomes = [];

  for (let i = 0; i < DATASET_SIZES.evaluationBatchSize; i++) {
    const caseId = `eval-${i.toString().padStart(4, "0")}`;
    const features = generateCaseFeatures(rng, caseId);
    const latentPropensity = sampleLatentPropensity(rng, features);
    const record = buildPotentialOutcomes(features, latentPropensity);
    cases.push(features);
    potentialOutcomes.push(record);
  }
  return { cases, potentialOutcomes };
}

async function main() {
  await connectMongo();

  console.log(`[generate] config version: ${CONFIG_VERSION}`);
  console.log(`[generate] wiping previous generated collections...`);
  await Promise.all([
    TrainingRowModel.deleteMany({}),
    EvaluationCaseModel.deleteMany({}),
    PotentialOutcomesModel.deleteMany({}),
  ]);

  console.log(`[generate] building training corpus (${DATASET_SIZES.trainingCorpusSize} rows, seed=${GENERATION_SEEDS.trainingSeed})...`);
  const trainingRows = await generateTrainingCorpus();
  await TrainingRowModel.insertMany(trainingRows);

  console.log(`[generate] building evaluation batch (${DATASET_SIZES.evaluationBatchSize} cases, seed=${GENERATION_SEEDS.evaluationSeed})...`);
  const { cases, potentialOutcomes } = await generateEvaluationBatch();
  await EvaluationCaseModel.insertMany(cases);
  await PotentialOutcomesModel.insertMany(potentialOutcomes);

  console.log(`[generate] done.`);
  console.log(`[generate] training rows: ${trainingRows.length}, eval cases: ${cases.length}, hidden outcome records: ${potentialOutcomes.length}`);

  await disconnectMongo();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});