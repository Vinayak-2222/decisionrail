import "dotenv/config";

import {
  connectMongo,
  disconnectMongo,
} from "../db/mongoClient";

import {
  EvaluationCaseModel,
} from "../db/models/EvaluationCase";

async function main() {
  await connectMongo();

  try {
    const rows =
      await EvaluationCaseModel.find(
        {
          caseId: /^eval-/,
        },
        {
          caseId: 1,
          state: 1,
        }
      )
        .sort({ caseId: 1 })
        .lean();

    const counts: Record<string, number> = {};

    for (const row of rows) {
      const state =
        row.state || "UNSET";

      counts[state] =
        (counts[state] || 0) + 1;
    }

    console.log(
      `Evaluation cases: ${rows.length}`
    );

    console.log(
      "State counts:",
      counts
    );

    console.log(
      "First 10 cases:"
    );

    console.log(
      rows.slice(0, 10)
    );
  } finally {
    await disconnectMongo();
  }
}

main().catch(async (error) => {
  console.error(error);

  try {
    await disconnectMongo();
  } catch {}

  process.exit(1);
});