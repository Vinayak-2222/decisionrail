import { ActionExecutor } from "./actionExecutor";
import { DecisionRailPolicy } from "../policy/DecisionRailPolicy";
import { StateManager } from "../state/stateManager";
import { CaseContext } from "../context/contextBuilder";
import { ActionType } from "../config/modelingConfig";
import {
  connectMongo,
  disconnectMongo,
} from "../db/mongoClient";
import { EvaluationCaseModel } from "../db/models/EvaluationCase";

async function main() {
  await connectMongo();

  try {
    const policy = new DecisionRailPolicy();
    const stateManager = new StateManager();

    const executor = new ActionExecutor(
      policy,
      stateManager
    );

    const baseContext: CaseContext = {
      caseId: "DAY4-EXECUTOR-001",
      declineCategory: "insufficient_funds",
      hardSoft: "soft",
      valueTier: "low",
      amountAtRisk: 1000,
      attemptNumber: 1,
      retryHistory: [],
      timeRemainingDays: 2,
      historicalRecoverer: false,
      serialFailer: false,
    };

    const confidenceByAction: Record<
      ActionType,
      number
    > = {
      retry_now: 0.80,
      retry_later: 0.75,
      notify_only: 0.70,
      escalate: 0.60,
      stop: 1.00,
    };

    function assert(
      condition: boolean,
      message: string
    ): void {
      if (!condition) {
        throw new Error(`FAIL: ${message}`);
      }

      console.log(`PASS: ${message}`);
    }

    console.log(
      "\n=== DAY 4: ACTION EXECUTOR TEST ==="
    );

    // Create/reset MongoDB case.
    await EvaluationCaseModel.findOneAndUpdate(
      { caseId: baseContext.caseId },
      {
        ...baseContext,
        state: "At Risk",
        fallback_active: false,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    // --------------------------------------------------
    // 1. NORMAL EXECUTION
    // --------------------------------------------------

    const filtered =
      policy.filterCandidates(baseContext);

    const approved =
      policy.evaluateApprovalGates(
        filtered,
        baseContext,
        "retry_now",
        confidenceByAction,
        false
      );

    const normalResult =
      await executor.execute({
        decisionId: "decision-001",
        caseId: baseContext.caseId,
        currentState: "At Risk",
        action: "retry_now",
        policyResult: approved,
      });

    assert(
      normalResult.executed === true,
      "normal recovery action executes"
    );

    assert(
      normalResult.finalState === "Retry Scheduled",
      "normal recovery action -> Retry Scheduled"
    );

    // --------------------------------------------------
    // 2. VERIFY STATE PERSISTED
    // --------------------------------------------------

    const persistedCase =
      await EvaluationCaseModel.findOne({
        caseId: baseContext.caseId,
      }).lean();

    assert(
      persistedCase?.state === "Retry Scheduled",
      "state persisted in MongoDB"
    );

    // --------------------------------------------------
    // 3. DUPLICATE EXECUTION
    // --------------------------------------------------

    const duplicateResult =
      await executor.execute({
        decisionId: "decision-001",
        caseId: baseContext.caseId,
        currentState: "Retry Scheduled",
        action: "retry_now",
        policyResult: approved,
      });

    assert(
      duplicateResult.executed === true,
      "duplicate returns original execution result"
    );

    assert(
      duplicateResult.reason.includes(
        "Idempotent"
      ),
      "duplicate execution is ignored idempotently"
    );

    // --------------------------------------------------
    // 4. UNAUTHORIZED POLICY
    // --------------------------------------------------

    const blockedResult =
      await executor.execute({
        decisionId: "decision-002",
        caseId: "DAY4-EXECUTOR-002",
        currentState: "At Risk",
        action: "retry_now",
        policyResult: {
          ...approved,
          policyAuthorized: false,
        },
      });

    assert(
      blockedResult.executed === false,
      "unauthorized policy blocks execution"
    );

    // --------------------------------------------------
    // 5. HUMAN APPROVAL
    // --------------------------------------------------

    const humanResult =
      await executor.execute({
        decisionId: "decision-003",
        caseId: "DAY4-EXECUTOR-003",
        currentState: "At Risk",
        action: "retry_now",
        policyResult: {
          ...approved,
          requiresHumanApproval: true,
        },
      });

    assert(
      humanResult.executed === false,
      "human approval blocks automatic execution"
    );

    // --------------------------------------------------
    // 6. SIMULATED FAILURE
    // --------------------------------------------------

    const failureCaseId =
      "DAY4-EXECUTOR-004";

    await EvaluationCaseModel.findOneAndUpdate(
      { caseId: failureCaseId },
      {
        ...baseContext,
        caseId: failureCaseId,
        state: "At Risk",
        fallback_active: false,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    const failureResult =
      await executor.execute({
        decisionId: "decision-004",
        caseId: failureCaseId,
        currentState: "At Risk",
        action: "retry_now",
        policyResult: approved,
        simulateFailure: true,
      });

    assert(
      failureResult.simulatedFailure === true,
      "simulated failure is reported"
    );

    assert(
      failureResult.finalState === "At Risk",
      "failed action returns to At Risk"
    );

    // --------------------------------------------------
    // 7. HARD DECLINE -> STOP
    // --------------------------------------------------

    const hardContext: CaseContext = {
      ...baseContext,
      caseId: "DAY4-EXECUTOR-005",
      declineCategory:
        "expired_blocked_card",
      hardSoft: "hard",
    };

    await EvaluationCaseModel.findOneAndUpdate(
      { caseId: hardContext.caseId },
      {
        ...hardContext,
        state: "At Risk",
        fallback_active: false,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    const hardFiltered =
      policy.filterCandidates(hardContext);

    const hardApproved =
      policy.evaluateApprovalGates(
        hardFiltered,
        hardContext,
        "stop",
        confidenceByAction,
        false
      );

    const stopResult =
      await executor.execute({
        decisionId: "decision-005",
        caseId: hardContext.caseId,
        currentState: "At Risk",
        action: "stop",
        policyResult: hardApproved,
      });

    assert(
      stopResult.executed === true,
      "hard-decline stop executes"
    );

    assert(
      stopResult.finalState === "Stopped",
      "stop action -> Stopped"
    );

    console.log(
      "\n=== ACTION EXECUTOR TEST: SUCCESS ==="
    );
  } finally {
    await disconnectMongo();
  }
}

main().catch(async (error) => {
  console.error(
    "\nAction Executor test failed:"
  );
  console.error(error);

  try {
    await disconnectMongo();
  } catch {}

  process.exit(1);
});