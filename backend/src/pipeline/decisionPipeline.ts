import fs from "fs";
import path from "path";

import {
  ActionType,
  CONFIG_VERSION,
} from "../config/modelingConfig";

import {
  EvaluationCaseModel,
} from "../db/models/EvaluationCase";

import {
  PotentialOutcomesModel,
} from "../db/models/PotentialOutcomes";

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
  StateManager,
} from "../state/stateManager";

import {
  ActionExecutor,
} from "../executor/actionExecutor";

import {
  AuditService,
} from "../audit/auditService";

export interface PipelineCaseResult {
  caseId: string;
  decisionId: string;
  chosenAction: ActionType;

  requiresHumanApproval: boolean;
  policyAuthorized: boolean;

  permittedActions: ActionType[];

  probability: number;
  confidence: number;
  expectedValue: number;

  resultingState: string;

  executed: boolean;
  simulatedFailure: boolean;

  recovered: boolean;

  fallbackActive: boolean;
}

export interface PipelineRunResult {
  casesProcessed: number;
  automaticExecutions: number;
  humanApprovalCases: number;
  stoppedCases: number;
  recoveredCases: number;
  recoveredAmount: number;
  totalAmountAtRisk: number;

  results: PipelineCaseResult[];
}

export class DecisionPipeline {
  private readonly estimator: LikelihoodEstimator;
  private readonly evEngine: EVEngine;
  private readonly policy: DecisionRailPolicy;
  private readonly stateManager: StateManager;
  private readonly executor: ActionExecutor;
  private readonly audit: AuditService;

  constructor() {
    const modelPath = path.join(
      process.cwd(),
      "models",
      "likelihoodEstimator.phase5-v1.json"
    );

    const modelArtifact = JSON.parse(
      fs.readFileSync(modelPath, "utf-8")
    );

    this.estimator =
      LikelihoodEstimator.fromModel(
        modelArtifact
      );

    this.evEngine = new EVEngine();
    this.policy = new DecisionRailPolicy();
    this.stateManager = new StateManager();

    this.executor = new ActionExecutor(
      this.policy,
      this.stateManager
    );

    this.audit = new AuditService();
  }

  async run(): Promise<PipelineRunResult> {
    /*
     * IMPORTANT:
     * Day 5 must process the existing evaluation batch only.
     *
     * Generated test fixtures from earlier days may also exist
     * in EvaluationCase. The eval- prefix isolates the official
     * 200-case experiment without regenerating anything.
     */
    const cases =
      await EvaluationCaseModel.find({
        caseId: /^eval-/,
      })
        .sort({ caseId: 1 })
        .lean();

    if (cases.length === 0) {
      throw new Error(
        "No evaluation cases found. Run `npm run generate` once to create the experiment batch."
      );
    }

    if (cases.length !== 200) {
      throw new Error(
        `Expected 200 evaluation cases, got ${cases.length}`
      );
    }

    const results: PipelineCaseResult[] = [];

    let automaticExecutions = 0;
    let humanApprovalCases = 0;
    let stoppedCases = 0;
    let recoveredCases = 0;
    let recoveredAmount = 0;
    let totalAmountAtRisk = 0;

    for (const evaluationCase of cases) {
      const context =
        buildCaseContext(
          evaluationCase as any
        );

      totalAmountAtRisk +=
        context.amountAtRisk;

      // ------------------------------------------------
      // POLICY FILTERING BEFORE EV
      // ------------------------------------------------

      const filtered =
        this.policy.filterCandidates(
          context
        );

      // ------------------------------------------------
      // LIKELIHOOD
      // ------------------------------------------------

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
          this.estimator.predict(input);

        probabilities[action] =
          prediction.probability;

        confidenceByAction[action] =
          prediction.confidence;
      }

      // ------------------------------------------------
      // EV
      // ------------------------------------------------

      const evResults =
        filtered.permittedActions.map(
          (action) =>
            this.evEngine.calculate({
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

      if (!winner) {
        throw new Error(
          `No permitted action for ${context.caseId}`
        );
      }

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

      // ------------------------------------------------
      // APPROVAL GATES
      // ------------------------------------------------

      const finalPolicy =
        this.policy.evaluateApprovalGates(
          filtered,
          context,
          winner.action,
          confidenceByAction,
          tieDetected
        );

      const decisionId =
        `${context.caseId}-cycle-1`;

      const eventId =
        `${decisionId}-created`;

      // ------------------------------------------------
      // AUDIT BEFORE EXECUTION
      // ------------------------------------------------

      await this.audit.recordDecision({
        eventId,
        decisionId,
        caseId:
          context.caseId,

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

      // ------------------------------------------------
      // HUMAN APPROVAL PATH
      // ------------------------------------------------

      if (
        finalPolicy.requiresHumanApproval
      ) {
        await EvaluationCaseModel.updateOne(
          {
            caseId:
              context.caseId,

            state:
              "At Risk",
          },
          {
            $set: {
              state:
                "Awaiting Human Approval",
            },
          }
        );

        humanApprovalCases++;

        results.push({
          caseId:
            context.caseId,

          decisionId,

          chosenAction:
            winner.action,

          requiresHumanApproval:
            true,

          policyAuthorized:
            finalPolicy.policyAuthorized,

          permittedActions:
            finalPolicy.permittedActions,

          probability:
            winner.recoveryProbability,

          confidence:
            confidenceByAction[
              winner.action
            ],

          expectedValue:
            winner.expectedValue,

          resultingState:
            "Awaiting Human Approval",

          executed: false,

          simulatedFailure: false,

          recovered: false,

          fallbackActive: false,
        });

        continue;
      }

      // ------------------------------------------------
      // STOP PATH
      // ------------------------------------------------

      if (winner.action === "stop") {
        const stopResult =
          await this.executor.execute({
            decisionId,

            caseId:
              context.caseId,

            currentState:
              "At Risk",

            action:
              "stop",

            policyResult:
              finalPolicy,
          });

        stoppedCases++;

        results.push({
          caseId:
            context.caseId,

          decisionId,

          chosenAction:
            winner.action,

          requiresHumanApproval:
            false,

          policyAuthorized:
            finalPolicy.policyAuthorized,

          permittedActions:
            finalPolicy.permittedActions,

          probability:
            winner.recoveryProbability,

          confidence:
            confidenceByAction[
              winner.action
            ],

          expectedValue:
            winner.expectedValue,

          resultingState:
            stopResult.finalState,

          executed:
            stopResult.executed,

          simulatedFailure:
            stopResult.simulatedFailure,

          recovered: false,

          fallbackActive: false,
        });

        continue;
      }

      // ------------------------------------------------
      // AUTOMATIC EXECUTION
      // ------------------------------------------------

      const execution =
        await this.executor.execute({
          decisionId,

          caseId:
            context.caseId,

          currentState:
            "At Risk",

          action:
            winner.action,

          policyResult:
            finalPolicy,
        });

      automaticExecutions++;

      // ------------------------------------------------
      // HIDDEN OUTCOME LOOKUP
      //
      // Evaluation only.
      // No outcome is regenerated.
      // ------------------------------------------------

      const hiddenOutcome =
        await PotentialOutcomesModel.findOne({
          caseId:
            context.caseId,
        }).lean();

      if (!hiddenOutcome) {
        throw new Error(
          `Missing hidden outcome for ${context.caseId}`
        );
      }

      const recovered =
        execution.executed
          ? (
              hiddenOutcome.outcomes[
                winner.action
              ] ?? false
            )
          : false;

      // ------------------------------------------------
      // RECOVERY TRANSITION
      // ------------------------------------------------

      if (recovered) {
        await this.stateManager
          .transitionAndPersist(
            context.caseId,
            "Retry Scheduled",
            {
              type:
                "action_recovered",
            }
          );

        recoveredCases++;

        recoveredAmount +=
          context.amountAtRisk;
      }

      results.push({
        caseId:
          context.caseId,

        decisionId,

        chosenAction:
          winner.action,

        requiresHumanApproval:
          false,

        policyAuthorized:
          finalPolicy.policyAuthorized,

        permittedActions:
          finalPolicy.permittedActions,

        probability:
          winner.recoveryProbability,

        confidence:
          confidenceByAction[
            winner.action
          ],

        expectedValue:
          winner.expectedValue,

        resultingState:
          recovered
            ? "Recovered"
            : execution.finalState,

        executed:
          execution.executed,

        simulatedFailure:
          execution.simulatedFailure,

        recovered,

        fallbackActive:
          false,
      });
    }

    return {
      casesProcessed:
        cases.length,

      automaticExecutions,

      humanApprovalCases,

      stoppedCases,

      recoveredCases,

      recoveredAmount,

      totalAmountAtRisk,

      results,
    };
  }
}