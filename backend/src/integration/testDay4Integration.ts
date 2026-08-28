import assert from "assert";
import fs from "fs";
import path from "path";

import {
  connectMongo,
  disconnectMongo,
} from "../db/mongoClient";

import {
  EvaluationCaseModel,
} from "../db/models/EvaluationCase";

import {
  AuditRecordModel,
} from "../db/models/AuditRecord";

import {
  buildCaseContext,
} from "../context/contextBuilder";

import {
  LikelihoodEstimator,
  LikelihoodInput,
} from "../estimator/likelihoodEstimator";

import {
  EVEngine,
} from "../policy/EVEngine";

import {
  DecisionRailPolicy,
} from "../policy/DecisionRailPolicy";

import {
  ActionExecutor,
} from "../executor/actionExecutor";

import {
  AuditService,
} from "../audit/auditService";

import {
  ActionType,
  CONFIG_VERSION,
} from "../config/modelingConfig";

import {
  StateManager,
} from "../state/stateManager";

async function main() {
  await connectMongo();

  try {
    console.log(
      "\n=== DAY 4: TRUE END-TO-END INTEGRATION ==="
    );

    const caseId =
      "DAY4-TRUE-INTEGRATION-001";

    const decisionId =
      "decision-day4-true-001";

    const eventId =
      "event-day4-true-001";

    // --------------------------------------------------
    // CLEAN TEST DATA
    // --------------------------------------------------

    await EvaluationCaseModel.deleteOne({
      caseId,
    });

    await AuditRecordModel.deleteMany({
      decisionId,
      eventId,
    });

    // --------------------------------------------------
    // 1. CREATE CASE
    // --------------------------------------------------

    await EvaluationCaseModel.create({
      caseId,
      declineCategory: "insufficient_funds",
      hardSoft: "soft",
      valueTier: "medium",
      arpu: 1000,
      amountAtRisk: 1000,
      attemptNumber: 1,
      retryHistory: [],
      historicalRecoverer: false,
      serialFailer: false,
      timeRemainingDays: 2,
      state: "At Risk",
      fallback_active: false,
    });

    console.log("PASS: test case created");

    // --------------------------------------------------
    // 2. CONTEXT
    // --------------------------------------------------

    const storedCase =
      await EvaluationCaseModel.findOne({
        caseId,
      }).lean();

    assert(storedCase);

    const context =
      buildCaseContext(storedCase as any);

    console.log("PASS: context built");

    // --------------------------------------------------
    // 3. POLICY FILTER
    // --------------------------------------------------

    const policy =
      new DecisionRailPolicy();

    const filtered =
      policy.filterCandidates(context);

    assert(
      filtered.permittedActions.length > 0
    );

    console.log(
      "PASS: policy filtered candidate actions"
    );

    // --------------------------------------------------
    // 4. FROZEN MODEL
    // --------------------------------------------------

    const modelPath =
      path.join(
        process.cwd(),
        "models",
        "likelihoodEstimator.phase5-v1.json"
      );

    const modelArtifact =
      JSON.parse(
        fs.readFileSync(
          modelPath,
          "utf-8"
        )
      );

    const estimator =
      LikelihoodEstimator.fromModel(
        modelArtifact
      );

    console.log(
      "PASS: frozen model loaded"
    );

    // --------------------------------------------------
    // 5. LIKELIHOOD
    // --------------------------------------------------

    const probabilities =
      {} as Record<ActionType, number>;

    const confidenceByAction =
      {} as Record<ActionType, number>;

    for (
      const action of
      filtered.permittedActions
    ) {
      const input: LikelihoodInput = {
        declineCategory:
          context.declineCategory,

        valueTier:
          context.valueTier,

        attemptNumber:
          context.attemptNumber,

        historicalRecoverer:
          context.historicalRecoverer,

        serialFailer:
          context.serialFailer,

        timeRemainingDays:
          context.timeRemainingDays,

        action,
      };

      const prediction =
        estimator.predict(input);

      probabilities[action] =
        prediction.probability;

      confidenceByAction[action] =
        prediction.confidence;
    }

    console.log(
      "PASS: likelihood predictions generated"
    );

    // --------------------------------------------------
    // 6. EV
    // --------------------------------------------------

    const evEngine =
      new EVEngine();

    const evResults =
      filtered.permittedActions.map(
        (action) =>
          evEngine.calculate({
            action,
            recoveryProbability:
              probabilities[action],
            amountAtRisk:
              context.amountAtRisk,
          })
      );

    const sorted =
      [...evResults].sort(
        (a, b) =>
          b.expectedValue -
          a.expectedValue
      );

    const winner =
      sorted[0];

    assert(winner);

    const secondBest =
      sorted[1];

    const tieDetected =
      secondBest !== undefined &&
      Math.abs(
        winner.expectedValue -
          secondBest.expectedValue
      ) /
        Math.max(
          Math.abs(
            winner.expectedValue
          ),
          1
        ) <= 0.01;

    console.log(
      `PASS: EV winner selected -> ${winner.action}`
    );

    // --------------------------------------------------
    // 7. POLICY APPROVAL GATES
    // --------------------------------------------------

    const finalPolicy =
      policy.evaluateApprovalGates(
        filtered,
        context,
        winner.action,
        confidenceByAction,
        tieDetected
      );

    assert(
      finalPolicy.permittedActions.includes(
        winner.action
      )
    );

    console.log(
      "PASS: final policy gates evaluated"
    );

    // --------------------------------------------------
    // 8. DETERMINE DECISION STATE
    // --------------------------------------------------

    let expectedState:
      | "Retry Scheduled"
      | "Awaiting Human Approval"
      | "Stopped";

    if (
      finalPolicy.hardDecline ||
      winner.expectedValue <= 0
    ) {
      expectedState = "Stopped";
    } else if (
      finalPolicy.requiresHumanApproval
    ) {
      expectedState =
        "Awaiting Human Approval";
    } else {
      expectedState =
        "Retry Scheduled";
    }

    // --------------------------------------------------
    // 9. AUDIT BEFORE EXECUTION
    // --------------------------------------------------

    const auditService =
      new AuditService();

    const auditResult =
      await auditService.recordDecision({
        eventId,
        decisionId,
        caseId,

        inputSignals: {
          declineCategory:
            context.declineCategory,

          valueTier:
            context.valueTier,

          retryCount:
            context.attemptNumber,

          timeRemainingDays:
            context.timeRemainingDays,

          amountAtRisk:
            context.amountAtRisk,

          historicalRecoverer:
            context.historicalRecoverer,

          serialFailer:
            context.serialFailer,
        },

        likelihoods:
          Object.fromEntries(
            filtered.permittedActions.map(
              (action) => [
                action,
                {
                  probability:
                    probabilities[action],

                  confidence:
                    confidenceByAction[action],
                },
              ]
            )
          ),

        evResults:
          Object.fromEntries(
            evResults.map(
              (result) => [
                result.action,
                result.expectedValue,
              ]
            )
          ),

        chosenAction:
          winner.action,

        policyChecks: {
          permittedActions:
            finalPolicy.permittedActions,

          retryLimitReached:
            finalPolicy.retryLimitReached,

          contactCapReached:
            finalPolicy.contactCapReached,

          hardDecline:
            finalPolicy.hardDecline,

          highValueFlag:
            finalPolicy.highValueFlag,

          lowConfidenceFlag:
            finalPolicy.lowConfidenceFlag,

          tieFlag:
            finalPolicy.tieFlag,

          reasons:
            finalPolicy.reasons,
        },

        requiresHumanApproval:
          finalPolicy.requiresHumanApproval,

        policyAuthorized:
          finalPolicy.policyAuthorized,

        modelVersion:
          CONFIG_VERSION,

        policyVersion:
          CONFIG_VERSION,

        costModelVersion:
          CONFIG_VERSION,

        resultingState:
          "At Risk",
      });

    assert(
      auditResult.created === true
    );

    console.log(
      "PASS: audit written BEFORE execution"
    );

    // --------------------------------------------------
    // 10. EXECUTE
    // --------------------------------------------------

    const executor =
      new ActionExecutor(
        policy,
        new StateManager()
      );

    let executionResult;

    if (
      finalPolicy.requiresHumanApproval
    ) {
      executionResult =
        await executor.execute({
          decisionId,
          caseId,
          currentState: "At Risk",
          action: winner.action,
          policyResult: finalPolicy,
        });

      assert(
        executionResult.executed === false
      );

      console.log(
        "PASS: execution correctly gated for human approval"
      );
    } else {
      executionResult =
        await executor.execute({
          decisionId,
          caseId,
          currentState: "At Risk",
          action: winner.action,
          policyResult: finalPolicy,
        });

      assert(
        executionResult.executed === true
      );

      console.log(
        "PASS: authorized action executed"
      );
    }

    // --------------------------------------------------
    // 11. VERIFY PERSISTED STATE
    // --------------------------------------------------

    const finalCase =
      await EvaluationCaseModel.findOne({
        caseId,
      }).lean();

    assert(finalCase);

    if (finalPolicy.requiresHumanApproval) {
      assert(
        finalCase.state ===
          "At Risk"
      );
    } else {
      assert(
        finalCase.state ===
          "Retry Scheduled"
      );
    }

    console.log(
      `PASS: persisted state verified -> ${finalCase.state}`
    );

    // --------------------------------------------------
    // 12. DUPLICATE AUDIT
    // --------------------------------------------------

    const duplicateAudit =
      await auditService.recordDecision({
        eventId,
        decisionId,
        caseId,

        inputSignals: {
          declineCategory:
            context.declineCategory,

          valueTier:
            context.valueTier,

          retryCount:
            context.attemptNumber,

          timeRemainingDays:
            context.timeRemainingDays,

          amountAtRisk:
            context.amountAtRisk,

          historicalRecoverer:
            context.historicalRecoverer,

          serialFailer:
            context.serialFailer,
        },

        likelihoods:
          Object.fromEntries(
            filtered.permittedActions.map(
              (action) => [
                action,
                {
                  probability:
                    probabilities[action],
                  confidence:
                    confidenceByAction[action],
                },
              ]
            )
          ),

        evResults:
          Object.fromEntries(
            evResults.map(
              (result) => [
                result.action,
                result.expectedValue,
              ]
            )
          ),

        chosenAction:
          winner.action,

        policyChecks: {
          permittedActions:
            finalPolicy.permittedActions,
        },

        requiresHumanApproval:
          finalPolicy.requiresHumanApproval,

        policyAuthorized:
          finalPolicy.policyAuthorized,

        modelVersion:
          CONFIG_VERSION,

        policyVersion:
          CONFIG_VERSION,

        costModelVersion:
          CONFIG_VERSION,

        resultingState:
          finalCase.state || expectedState,
      });

    assert(
      duplicateAudit.duplicate === true
    );

    console.log(
      "PASS: duplicate audit ignored"
    );

    console.log(
      "\n=== DAY 4 TRUE INTEGRATION: SUCCESS ==="
    );
  } finally {
    await disconnectMongo();
  }
}

main().catch(async (error) => {
  console.error(
    "\nDay 4 integration failed:"
  );

  console.error(error);

  try {
    await disconnectMongo();
  } catch {}

  process.exit(1);
});