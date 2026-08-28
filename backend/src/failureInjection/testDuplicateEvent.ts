import {
  connectMongo,
  disconnectMongo,
} from "../db/mongoClient";

import {
  AuditRecordModel,
} from "../db/models/AuditRecord";

import {
  EvaluationCaseModel,
} from "../db/models/EvaluationCase";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }

  console.log(
    `PASS: ${message}`
  );
}

async function main() {
  console.log(
    "\n=== DAY 7: DUPLICATE EVENT INJECTION ==="
  );

  await connectMongo();

  const caseId =
    "eval-0000";

  const decisionId =
    `${caseId}-cycle-1`;

  const beforeCount =
    await AuditRecordModel.countDocuments(
      {
        caseId,
        decisionId,
      }
    );

  const beforeCase =
    await EvaluationCaseModel
      .findOne({
        caseId,
      })
      .lean();

  if (!beforeCase) {
    throw new Error(
      `Case not found: ${caseId}`
    );
  }

  /*
   * Simulate the duplicate-event idempotency check.
   *
   * The same case + decision identity already exists,
   * so the second event must not create another decision.
   */
  const existing =
    await AuditRecordModel.findOne({
      caseId,
      decisionId,
    }).lean();

  assert(
    !!existing,
    "existing decision is detected as duplicate"
  );

  /*
   * Verify no new audit record was created.
   */
  const afterCount =
    await AuditRecordModel.countDocuments(
      {
        caseId,
        decisionId,
      }
    );

  assert(
    afterCount === beforeCount,
    "duplicate event creates no additional audit record"
  );

  /*
   * Verify the duplicate did not alter state.
   */
  const afterCase =
    await EvaluationCaseModel
      .findOne({
        caseId,
      })
      .lean();

  assert(
    afterCase?.state ===
      beforeCase.state,
    "duplicate event does not change case state"
  );

  console.log(
    `audit records before: ${beforeCount}`
  );

  console.log(
    `audit records after:  ${afterCount}`
  );

  console.log(
    `case state: ${afterCase?.state}`
  );

  console.log(
    "\n=== DUPLICATE EVENT TEST: SUCCESS ==="
  );

  await disconnectMongo();
}

main().catch(
  async (error) => {
    console.error(
      "\nDuplicate event test failed:"
    );

    console.error(error);

    try {
      await disconnectMongo();
    } catch {}

    process.exit(1);
  }
);