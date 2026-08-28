import {
  EvaluationCaseModel,
} from "../db/models/EvaluationCase";

import {
  PotentialOutcomesModel,
} from "../db/models/PotentialOutcomes";

import {
  AuditRecordModel,
} from "../db/models/AuditRecord";

import {
  buildCaseContext,
} from "../context/contextBuilder";

import {
  BaselinePolicy,
} from "../policy/BaselinePolicy";

import {
  ActionType,
} from "../config/modelingConfig";

export interface PolicyMetrics {
  recoveredAmount: number;
  recoveredCases: number;
  recoveryRate: number;

  totalAmountAtRisk: number;

  selectedCases: number;
  executedCases: number;

  retryCases: number;
  stopCases: number;
  escalationCases: number;
}

export interface ExperimentMetrics {
  batchSize: number;

  sameBatchVerified: boolean;
  sameHiddenOutcomesVerified: boolean;

  decisionRail: PolicyMetrics;
  baseline: PolicyMetrics;

  incrementalRecoveredAmount: number;

  recoveryRateImprovementPercentagePoints: number;

  relativeRecoveredAmountImprovementPercent: number;

  wastedRetriesAvoided: number;

  highValueAccountsSaved: number;

  unnecessaryWriteOffRate: number;

  baselineUnnecessaryWriteOffRate: number;

  falseEscalationRate: number | null;

  falseEscalationRateAvailable: boolean;

  falseEscalationRateReason: string;

  decisionRailDecisionAuditRecords: number;

  decisionRailExecutionAuditRecords: number;

  humanResolutionAuditRecords: number;

  syntheticTestMode: true;

  notes: string[];
}

interface DecisionRecord {
  caseId: string;
  decisionId: string;
  chosenAction: ActionType;
  requiresHumanApproval: boolean;
}

interface HumanResolution {
  decisionId: string;
  humanAction:
    | "approve"
    | "override"
    | "stop";

  originalAction:
    | ActionType
    | null;

  resolvedAction:
    | ActionType
    | null;
}

const VALID_ACTIONS: ActionType[] = [
  "retry_now",
  "retry_later",
  "notify_only",
  "escalate",
  "stop",
];

export class MetricsService {
  async computeExperimentMetrics(): Promise<ExperimentMetrics> {
    // --------------------------------------------------
    // 1. LOAD THE FIXED EVALUATION BATCH
    // --------------------------------------------------

    const evaluationCases =
      await EvaluationCaseModel.find({
        caseId: /^eval-/,
      })
        .sort({
          caseId: 1,
        })
        .lean();

    if (
      evaluationCases.length !== 200
    ) {
      throw new Error(
        `Expected exactly 200 evaluation cases, found ${evaluationCases.length}`
      );
    }

    // --------------------------------------------------
    // 2. LOAD THE FIXED HIDDEN OUTCOMES
    //
    // NEVER REGENERATE HERE.
    // --------------------------------------------------

    const hiddenOutcomes =
      await PotentialOutcomesModel.find({
        caseId: /^eval-/,
      })
        .sort({
          caseId: 1,
        })
        .lean();

    if (
      hiddenOutcomes.length !== 200
    ) {
      throw new Error(
        `Expected exactly 200 hidden outcome records, found ${hiddenOutcomes.length}`
      );
    }

    const outcomeByCaseId =
      new Map(
        hiddenOutcomes.map(
          (record) => [
            record.caseId,
            record,
          ]
        )
      );

    // --------------------------------------------------
    // 3. LOAD DECISIONRAIL AUDIT EVENTS
    // --------------------------------------------------

    const auditRecords =
      await AuditRecordModel.find({
        caseId: /^eval-/,
      })
        .sort({
          caseId: 1,
          timestamp: 1,
        })
        .lean();

    const decisionAuditRecords =
      auditRecords.filter(
        (record) =>
          record.eventId.endsWith(
            "-created"
          )
      );

    const executionAuditRecords =
      auditRecords.filter(
        (record) =>
          record.eventId.endsWith(
            "-execution"
          )
      );

    const humanResolutionAuditRecords =
      auditRecords.filter(
        (record) =>
          record.eventId.includes(
            "-human-"
          )
      );

    // --------------------------------------------------
    // 4. ONE POLICY DECISION PER CASE
    // --------------------------------------------------

    const decisionByCaseId =
      new Map<
        string,
        DecisionRecord
      >();

    for (
      const record of
      decisionAuditRecords
    ) {
      if (
        !VALID_ACTIONS.includes(
          record.chosenAction as ActionType
        )
      ) {
        throw new Error(
          `Invalid DecisionRail action for ${record.caseId}: ${record.chosenAction}`
        );
      }

      if (
        decisionByCaseId.has(
          record.caseId
        )
      ) {
        throw new Error(
          `Multiple decision-created records found for ${record.caseId}`
        );
      }

      decisionByCaseId.set(
        record.caseId,
        {
          caseId:
            record.caseId,

          decisionId:
            record.decisionId,

          chosenAction:
            record.chosenAction as ActionType,

          requiresHumanApproval:
            Boolean(
              record.requiresHumanApproval
            ),
        }
      );
    }

    if (
      decisionByCaseId.size !==
      evaluationCases.length
    ) {
      throw new Error(
        `Expected one DecisionRail decision for every evaluation case. Found ${decisionByCaseId.size} for ${evaluationCases.length}.`
      );
    }

    // --------------------------------------------------
    // 5. HUMAN RESOLUTION INDEX
    // --------------------------------------------------

    const humanResolutionByDecisionId =
      new Map<
        string,
        HumanResolution
      >();

    for (
      const record of
      humanResolutionAuditRecords
    ) {
      const humanAction =
        record
          .policyChecks
          ?.humanAction;

      if (
        humanAction !==
          "approve" &&
        humanAction !==
          "override" &&
        humanAction !==
          "stop"
      ) {
        continue;
      }

      humanResolutionByDecisionId.set(
        record.decisionId,
        {
          decisionId:
            record.decisionId,

          humanAction,

          originalAction:
            (
              record
                .policyChecks
                ?.originalAction ||
              null
            ) as ActionType | null,

          resolvedAction:
            (
              record
                .chosenAction ||
              null
            ) as ActionType | null,
        }
      );
    }

    // --------------------------------------------------
    // 6. EXECUTION INDEX
    //
    // Operational information only.
    // It does NOT alter policy-efficacy scoring.
    // --------------------------------------------------

    const executedDecisionIds =
      new Set<string>();

    for (
      const record of
      executionAuditRecords
    ) {
      if (
        record
          .executionResult
          ?.executed === true
      ) {
        executedDecisionIds.add(
          record.decisionId
        );
      }
    }

    // --------------------------------------------------
    // 7. BASELINE POLICY
    // --------------------------------------------------

    const baselinePolicy =
      new BaselinePolicy();

    const totalAmountAtRisk =
      evaluationCases.reduce(
        (
          sum,
          evaluationCase
        ) =>
          sum +
          evaluationCase.amountAtRisk,
        0
      );

    let decisionRailRecoveredAmount = 0;
    let decisionRailRecoveredCases = 0;

    let baselineRecoveredAmount = 0;
    let baselineRecoveredCases = 0;

    let decisionRailRetryCases = 0;
    let decisionRailStopCases = 0;
    let decisionRailEscalationCases = 0;

    let baselineRetryCases = 0;
    let baselineStopCases = 0;

    let wastedRetriesAvoided = 0;

    let highValueAccountsSaved = 0;

    let decisionRailUnnecessaryWriteOffs = 0;

    let baselineUnnecessaryWriteOffs = 0;

    const stopDecisionCount =
      evaluationCases.filter(
        (evaluationCase) =>
          decisionByCaseId.get(
            evaluationCase.caseId
          )?.chosenAction ===
          "stop"
      ).length;

    const baselineStopCount =
      evaluationCases.filter(
        (evaluationCase) =>
          baselinePolicy.decide(
            buildCaseContext(
              evaluationCase as any
            )
          ) ===
          "stop"
      ).length;

    // --------------------------------------------------
    // 8. PAIRED POLICY SCORING
    //
    // THIS is the actual synthetic experiment.
    //
    // For each policy:
    //   choose action
    //   lookup same hidden outcome
    //
    // Execution state does not alter this comparison.
    // --------------------------------------------------

    for (
      const evaluationCase of
      evaluationCases
    ) {
      const hiddenOutcome =
        outcomeByCaseId.get(
          evaluationCase.caseId
        );

      if (!hiddenOutcome) {
        throw new Error(
          `Missing hidden outcome for ${evaluationCase.caseId}`
        );
      }

      const decision =
        decisionByCaseId.get(
          evaluationCase.caseId
        );

      if (!decision) {
        throw new Error(
          `Missing DecisionRail decision for ${evaluationCase.caseId}`
        );
      }

      const decisionRailRecovered =
        Boolean(
          hiddenOutcome.outcomes[
            decision.chosenAction
          ]
        );

      const baselineAction =
        baselinePolicy.decide(
          buildCaseContext(
            evaluationCase as any
          )
        );

      const baselineRecovered =
        Boolean(
          hiddenOutcome.outcomes[
            baselineAction
          ]
        );

      // ----------------------------------------------
      // DecisionRail recovery
      // ----------------------------------------------

      if (
        decisionRailRecovered
      ) {
        decisionRailRecoveredCases++;

        decisionRailRecoveredAmount +=
          evaluationCase.amountAtRisk;
      }

      // ----------------------------------------------
      // Baseline recovery
      // ----------------------------------------------

      if (
        baselineRecovered
      ) {
        baselineRecoveredCases++;

        baselineRecoveredAmount +=
          evaluationCase.amountAtRisk;
      }

      // ----------------------------------------------
      // DecisionRail action distribution
      // ----------------------------------------------

      if (
        decision.chosenAction ===
          "retry_now" ||
        decision.chosenAction ===
          "retry_later"
      ) {
        decisionRailRetryCases++;
      }

      if (
        decision.chosenAction ===
        "stop"
      ) {
        decisionRailStopCases++;
      }

      if (
        decision.chosenAction ===
        "escalate"
      ) {
        decisionRailEscalationCases++;
      }

      // ----------------------------------------------
      // Baseline distribution
      // ----------------------------------------------

      if (
        baselineAction ===
        "retry_later"
      ) {
        baselineRetryCases++;
      }

      if (
        baselineAction ===
        "stop"
      ) {
        baselineStopCases++;
      }

      // ----------------------------------------------
      // WASTED RETRIES AVOIDED
      //
      // DecisionRail stops.
      // Baseline retries.
      // Same hidden outcome says baseline would NOT
      // recover.
      // ----------------------------------------------

      if (
        decision.chosenAction ===
          "stop" &&
        baselineAction ===
          "retry_later" &&
        !baselineRecovered
      ) {
        wastedRetriesAvoided++;
      }

      // ----------------------------------------------
      // HIGH-VALUE ACCOUNTS SAVED
      //
      // DecisionRail recovers.
      // Baseline would stop.
      // ----------------------------------------------

      if (
        (
          evaluationCase.valueTier ===
            "high" ||
          evaluationCase.valueTier ===
            "enterprise"
        ) &&
        decisionRailRecovered &&
        baselineAction ===
          "stop"
      ) {
        highValueAccountsSaved++;
      }

      // ----------------------------------------------
      // UNNECESSARY WRITE-OFF
      //
      // DecisionRail stops but baseline action would
      // have recovered.
      // ----------------------------------------------

      if (
        decision.chosenAction ===
          "stop" &&
        baselineRecovered
      ) {
        decisionRailUnnecessaryWriteOffs++;
      }

      // ----------------------------------------------
      // Baseline equivalent
      //
      // Baseline stops but an alternate retry would
      // have recovered on the SAME hidden table.
      // ----------------------------------------------

      if (
        baselineAction ===
        "stop"
      ) {
        const baselineRetryOutcome =
          hiddenOutcome.outcomes[
            "retry_later"
          ] ?? false;

        if (
          baselineRetryOutcome
        ) {
          baselineUnnecessaryWriteOffs++;
        }
      }
    }

    // --------------------------------------------------
    // 9. POLICY METRICS
    // --------------------------------------------------

    const decisionRailMetrics:
      PolicyMetrics = {
        recoveredAmount:
          decisionRailRecoveredAmount,

        recoveredCases:
          decisionRailRecoveredCases,

        recoveryRate:
          (
            decisionRailRecoveredCases /
            evaluationCases.length
          ) *
          100,

        totalAmountAtRisk,

        selectedCases:
          evaluationCases.length,

        executedCases:
          executedDecisionIds.size,

        retryCases:
          decisionRailRetryCases,

        stopCases:
          decisionRailStopCases,

        escalationCases:
          decisionRailEscalationCases,
      };

    const baselineMetrics:
      PolicyMetrics = {
        recoveredAmount:
          baselineRecoveredAmount,

        recoveredCases:
          baselineRecoveredCases,

        recoveryRate:
          (
            baselineRecoveredCases /
            evaluationCases.length
          ) *
          100,

        totalAmountAtRisk,

        selectedCases:
          evaluationCases.length,

        executedCases:
          evaluationCases.length,

        retryCases:
          baselineRetryCases,

        stopCases:
          baselineStopCases,

        escalationCases:
          0,
      };

    // --------------------------------------------------
    // 10. SAME-BATCH / SAME-HIDDEN-OUTCOME CHECKS
    // --------------------------------------------------

    const evaluationIds =
      evaluationCases.map(
        (item) =>
          item.caseId
      );

    const decisionIds =
      Array.from(
        decisionByCaseId.keys()
      ).sort();

    const sortedEvaluationIds =
      [...evaluationIds].sort();

    const sameBatchVerified =
      sortedEvaluationIds.length ===
        decisionIds.length &&
      sortedEvaluationIds.every(
        (id, index) =>
          id ===
          decisionIds[index]
      );

    if (
      !sameBatchVerified
    ) {
      throw new Error(
        "DecisionRail and evaluation batch do not contain the same case IDs."
      );
    }

    const sameHiddenOutcomesVerified =
      evaluationCases.every(
        (evaluationCase) =>
          outcomeByCaseId.has(
            evaluationCase.caseId
          )
      );

    if (
      !sameHiddenOutcomesVerified
    ) {
      throw new Error(
        "Evaluation cases and hidden outcomes do not cover the same batch."
      );
    }

    // --------------------------------------------------
    // 11. GUARDRAIL METRICS
    // --------------------------------------------------

    const unnecessaryWriteOffRate =
      stopDecisionCount === 0
        ? 0
        : (
            decisionRailUnnecessaryWriteOffs /
            stopDecisionCount
          ) *
          100;

    const baselineUnnecessaryWriteOffRate =
      baselineStopCount === 0
        ? 0
        : (
            baselineUnnecessaryWriteOffs /
            baselineStopCount
          ) *
          100;

    // --------------------------------------------------
    // 12. FALSE ESCALATION
    //
    // Only human-resolved escalations can answer this.
    // An override away from escalation is treated as
    // evidence that the escalation was unnecessary.
    //
    // Pending escalations remain insufficient data.
    // --------------------------------------------------

    const escalationDecisions =
      Array.from(
        decisionByCaseId.values()
      ).filter(
        (decision) =>
          decision.chosenAction ===
          "escalate"
      );

    let falseEscalations = 0;
    let resolvedEscalations = 0;

    for (
      const decision of
      escalationDecisions
    ) {
      const resolution =
        humanResolutionByDecisionId.get(
          decision.decisionId
        );

      if (!resolution) {
        continue;
      }

      resolvedEscalations++;

      /*
       * Approving the original escalation means the
       * human accepted the need for escalation.
       *
       * Overriding or stopping an escalation means the
       * human rejected the escalation path.
       */
      if (
        resolution.humanAction ===
          "override" ||
        resolution.humanAction ===
          "stop"
      ) {
        falseEscalations++;
      }
    }

    const falseEscalationRate:
      number | null =
      resolvedEscalations ===
        escalationDecisions.length &&
      escalationDecisions.length > 0
        ? (
            falseEscalations /
            escalationDecisions.length
          ) *
          100
        : null;

    const falseEscalationRateAvailable =
      falseEscalationRate !==
      null;

    const falseEscalationRateReason =
      falseEscalationRateAvailable
        ? "All DecisionRail escalation decisions have recorded human resolutions."
        : `Only ${resolvedEscalations} of ${escalationDecisions.length} DecisionRail escalation decisions have recorded human resolutions; exact false-escalation rate remains insufficient until all are resolved.`;

    // --------------------------------------------------
    // 13. COMPARISON
    // --------------------------------------------------

    const incrementalRecoveredAmount =
      decisionRailMetrics.recoveredAmount -
      baselineMetrics.recoveredAmount;

    const recoveryRateImprovementPercentagePoints =
      decisionRailMetrics.recoveryRate -
      baselineMetrics.recoveryRate;

    const relativeRecoveredAmountImprovementPercent =
      baselineMetrics.recoveredAmount ===
        0
        ? 0
        : (
            incrementalRecoveredAmount /
            baselineMetrics.recoveredAmount
          ) *
          100;

    // --------------------------------------------------
    // 14. FINAL RESULT
    // --------------------------------------------------

    return {
      batchSize:
        evaluationCases.length,

      sameBatchVerified,

      sameHiddenOutcomesVerified,

      decisionRail:
        decisionRailMetrics,

      baseline:
        baselineMetrics,

      incrementalRecoveredAmount,

      recoveryRateImprovementPercentagePoints,

      relativeRecoveredAmountImprovementPercent,

      wastedRetriesAvoided,

      highValueAccountsSaved,

      unnecessaryWriteOffRate,

      baselineUnnecessaryWriteOffRate,

      falseEscalationRate,

      falseEscalationRateAvailable,

      falseEscalationRateReason,

      decisionRailDecisionAuditRecords:
        decisionAuditRecords.length,

      decisionRailExecutionAuditRecords:
        executionAuditRecords.length,

      humanResolutionAuditRecords:
        humanResolutionAuditRecords.length,

      syntheticTestMode:
        true,

      notes: [
        "DecisionRail and baseline are scored on the identical 200-case evaluation batch.",
        "Both policies use the identical precomputed hidden PotentialOutcomes table.",
        "No hidden outcomes are regenerated during metrics calculation.",
        "Policy efficacy is measured from the action each policy selected.",
        "Execution counts are reported separately as operational metrics.",
        "Human-approval decisions remain valid policy decisions even while awaiting execution.",
        "False-escalation remains insufficient until every escalation has a recorded human resolution.",
        "All results are synthetic/test-mode and are not real-world Razorpay performance claims.",
      ],
    };
  }
}