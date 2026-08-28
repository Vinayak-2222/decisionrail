import "dotenv/config";

import express, {
  NextFunction,
  Request,
  Response,
} from "express";

import crypto from "crypto";

import {
  connectMongo,
  disconnectMongo,
} from "./db/mongoClient";

import {
  EvaluationCaseModel,
} from "./db/models/EvaluationCase";

import {
  AuditRecordModel,
} from "./db/models/AuditRecord";

import {
  HumanApprovalService,
} from "./approval/humanApprovalService";

import {
  AuditService,
} from "./audit/auditService";

import {
  MetricsService,
} from "./metrics/metricsService";

import {
  LikelihoodEstimator,
  LikelihoodInput,
} from "./estimator/likelihoodEstimator";

import {
  DecisionPipeline,
} from "./pipeline/decisionPipeline";

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type Role =
  | "RevOps"
  | "Admin";

interface SessionRecord {
  sessionId: string;
  userId: string;
  role: Role;
  createdAt: number;
}

interface AuthenticatedRequest
  extends Request {
  user?: {
    userId: string;
    role: Role;
  };
}

// --------------------------------------------------
// APP CONFIG
// --------------------------------------------------

const app =
  express();

const PORT =
  Number(
    process.env.PORT || 4000
  );

const SERVICE_API_KEY =
  process.env.SERVICE_API_KEY ||
  "decisionrail-dev-key";

app.use(
  express.json()
);

// --------------------------------------------------
// IN-MEMORY SESSION STORE
// MVP ONLY
// --------------------------------------------------

const sessions =
  new Map<
    string,
    SessionRecord
  >();

// --------------------------------------------------
// DEMO USERS
// --------------------------------------------------

const USERS: Record<
  string,
  {
    password: string;
    role: Role;
  }
> = {
  revops: {
    password:
      "revops-demo",
    role:
      "RevOps",
  },

  admin: {
    password:
      "admin-demo",
    role:
      "Admin",
  },
};

// --------------------------------------------------
// SERVICES
// --------------------------------------------------

const approvalService =
  new HumanApprovalService();

const auditService =
  new AuditService();

const metricsService =
  new MetricsService();

const decisionPipeline =
  new DecisionPipeline();

// --------------------------------------------------
// AUTH HELPERS
// --------------------------------------------------

function createSession(
  userId: string,
  role: Role
): string {
  const sessionId =
    crypto
      .randomBytes(32)
      .toString("hex");

  sessions.set(
    sessionId,
    {
      sessionId,
      userId,
      role,
      createdAt:
        Date.now(),
    }
  );

  return sessionId;
}

function getBearerToken(
  req: Request
): string | null {
  const authorization =
    req.headers.authorization;

  if (
    !authorization ||
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }

  return authorization
    .slice(7)
    .trim();
}

// --------------------------------------------------
// USER SESSION AUTH
// --------------------------------------------------

function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token =
    getBearerToken(req);

  if (!token) {
    res.status(401).json({
      error:
        "Authentication required.",
    });

    return;
  }

  /*
   * Service API key is deliberately accepted
   * only where a service-level endpoint explicitly
   * calls requireServiceKey().
   */
  const session =
    sessions.get(token);

  if (!session) {
    res.status(401).json({
      error:
        "Invalid or expired session.",
    });

    return;
  }

  req.user = {
    userId:
      session.userId,
    role:
      session.role,
  };

  next();
}

// --------------------------------------------------
// ROLE AUTH
// --------------------------------------------------

function requireRole(
  ...allowedRoles: Role[]
) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        error:
          "Authentication required.",
      });

      return;
    }

    if (
      !allowedRoles.includes(
        req.user.role
      )
    ) {
      res.status(403).json({
        error:
          "Insufficient permissions.",
      });

      return;
    }

    next();
  };
}

// --------------------------------------------------
// SERVICE-LEVEL API KEY AUTH
// --------------------------------------------------

function requireServiceKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token =
    getBearerToken(req);

  if (
    !token ||
    token !==
      SERVICE_API_KEY
  ) {
    res.status(401).json({
      error:
        "Valid service API key required.",
    });

    return;
  }

  next();
}

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get(
  "/health",
  (_req, res) => {
    res.json({
      status:
        "ok",
    });
  }
);

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

app.post(
  "/api/auth/login",
  (req, res) => {
    const {
      username,
      password,
    } = req.body || {};

    if (
      typeof username !==
        "string" ||
      typeof password !==
        "string"
    ) {
      res.status(400).json({
        error:
          "username and password are required.",
      });

      return;
    }

    const user =
      USERS[username];

    if (
      !user ||
      user.password !==
        password
    ) {
      res.status(401).json({
        error:
          "Invalid credentials.",
      });

      return;
    }

    const sessionId =
      createSession(
        username,
        user.role
      );

    res.json({
      sessionId,

      user: {
        userId:
          username,
        role:
          user.role,
      },

      message:
        "Login successful.",
    });
  }
);

// --------------------------------------------------
// LOGOUT
// --------------------------------------------------

app.post(
  "/api/auth/logout",
  authenticate,
  (
    req: AuthenticatedRequest,
    res
  ) => {
    const token =
      getBearerToken(req);

    if (token) {
      sessions.delete(
        token
      );
    }

    res.json({
      success:
        true,
    });
  }
);

// --------------------------------------------------
// POST /events/payment-failed
//
// Service-level endpoint.
// --------------------------------------------------

app.post(
  "/events/payment-failed",
  requireServiceKey,
  async (
    req,
    res
  ) => {
    try {
      const {
        payment_attempt_id,
        caseId,
        declineCategory,
      } = req.body || {};

      if (
        typeof payment_attempt_id !==
          "string" ||
        typeof caseId !==
          "string"
      ) {
        res.status(400).json({
          error:
            "payment_attempt_id and caseId are required.",
        });

        return;
      }

      const existing =
        await AuditRecordModel.findOne({
          "policyChecks.payment_attempt_id":
            payment_attempt_id,
        }).lean();

      if (existing) {
        res.status(409).json({
          duplicate:
            true,

          message:
            "Duplicate payment failure ignored.",

          eventId:
            existing.eventId,
        });

        return;
      }

      /*
       * This is intentionally an ingestion acknowledgement
       * for the MVP. It does not silently invent customer
       * context or regenerate the controlled experiment.
       */
      res.status(202).json({
        accepted:
          true,

        payment_attempt_id,

        caseId,

        declineCategory:
          declineCategory ||
          null,

        message:
          "Payment failure accepted for processing.",
      });
    } catch (error) {
      console.error(
        "[api] payment-failed ingestion failed",
        error
      );

      res.status(500).json({
        error:
          "Failed to accept payment failure.",
      });
    }
  }
);

// --------------------------------------------------
// POST /admin/failure-injection/estimator
//
// Admin-only live demo of estimator-unavailable fallback.
// Creates a dedicated non-eval fixture and records exactly
// what happened. It never regenerates or modifies the
// official 200-case experiment.
// --------------------------------------------------

app.post(
  "/admin/failure-injection/estimator",
  authenticate,
  requireRole(
    "Admin"
  ),
  async (
    req,
    res
  ) => {
    const caseId =
      "DAY7-FALLBACK-001";

    const decisionId =
      `${caseId}-cycle-1`;

    try {
      // Clean only this dedicated failure-injection fixture.
      await EvaluationCaseModel.deleteOne({
        caseId,
      });

      await AuditRecordModel.deleteMany({
        decisionId,
      });

      // Create the dedicated case.
      await EvaluationCaseModel.create({
        caseId,

        declineCategory:
          "insufficient_funds",

        hardSoft:
          "soft",

        valueTier:
          "medium",

        arpu:
          1500,

        amountAtRisk:
          1500,

        attemptNumber:
          2,

        retryHistory:
          [
            {
              attemptNumber: 1,
              outcome: "failed",
            },
          ],

        historicalRecoverer:
          false,

        serialFailer:
          false,

        timeRemainingDays:
          2,

        state:
          "At Risk",

        fallback_active:
          false,
      });

      // Deliberately use an untrained estimator to simulate
      // the estimator being unavailable. The estimator itself
      // activates the deterministic category-prior fallback.
      const estimator =
        new LikelihoodEstimator();

      const input: LikelihoodInput = {
        declineCategory:
          "insufficient_funds",

        valueTier:
          "medium",

        attemptNumber:
          2,

        historicalRecoverer:
          false,

        serialFailer:
          false,

        timeRemainingDays:
          2,

        action:
          "retry_now",
      };

      const prediction =
        estimator.predict(input);

      if (!prediction.usedFallback) {
        throw new Error(
          "Injected estimator failure did not activate fallback."
        );
      }

      // Safe fallback policy: do not auto-execute when the model
      // is unavailable. Route the fallback-derived decision to
      // human approval instead.
      await EvaluationCaseModel.updateOne(
        {
          caseId,
          state:
            "At Risk",
        },
        {
          $set: {
            state:
              "Awaiting Human Approval",

            fallback_active:
              true,
          },
        }
      );

      await auditService.recordDecision({
        eventId:
          `${decisionId}-created`,

        decisionId,

        caseId,

        inputSignals: {
          declineCategory:
            "insufficient_funds",

          valueTier:
            "medium",

          retryCount:
            2,

          timeRemainingDays:
            2,

          amountAtRisk:
            1500,

          historicalRecoverer:
            false,

          serialFailer:
            false,
        },

        likelihoods: {
          retry_now: {
            probability:
              prediction.probability,

            confidence:
              prediction.confidence,
          },
        },

        evResults: {
          retry_now:
            Math.max(
              0,
              prediction.probability * 1500
            ),
        },

        chosenAction:
          "retry_now",

        policyChecks: {
          fallbackActive:
            true,

          injectedFailure:
            "estimator_unavailable",

          fallbackStrategy:
            "deterministic_category_prior",

          safeResolution:
            "human_approval_required",

          reason:
            "Estimator unavailable; conservative prior used and automatic execution blocked.",
        },

        requiresHumanApproval:
          true,

        policyAuthorized:
          true,

        modelVersion:
          "failure-injection-unavailable",

        policyVersion:
          "phase5-v1",

        costModelVersion:
          "phase5-v1",

        executionResult:
          {
            executed:
              false,

            fallbackApplied:
              true,

            injectedFailure:
              "estimator_unavailable",

            safeFallback:
              "human_approval_required",
          },

        resultingState:
          "Awaiting Human Approval",
      });

      res.status(200).json({
        success:
          true,

        injection:
          "estimator_unavailable",

        caseId,

        decisionId,

        fallbackApplied:
          true,

        fallbackProbability:
          prediction.probability,

        fallbackConfidence:
          prediction.confidence,

        resultingState:
          "Awaiting Human Approval",

        safeResolution:
          "Human approval required; automatic execution blocked.",

        nextStep:
          `Approve, override, or stop ${caseId} through the normal approval API.`,
      });
    } catch (error) {
      console.error(
        "[failure-injection] estimator unavailable failed",
        error
      );

      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Estimator failure injection failed.",
      });
    }
  }
);

// --------------------------------------------------
// GET /cases
//
// RevOps + Admin.
// --------------------------------------------------

app.get(
  "/cases",
  authenticate,
  requireRole(
    "RevOps",
    "Admin"
  ),
  async (
    _req,
    res
  ) => {
    try {
      const cases =
        await EvaluationCaseModel.find({
          caseId:
            /^eval-/,
        })
          .sort({
            caseId:
              1,
          })
          .select({
            _id:
              0,

            caseId:
              1,

            declineCategory:
              1,

            hardSoft:
              1,

            valueTier:
              1,

            amountAtRisk:
              1,

            attemptNumber:
              1,

            timeRemainingDays:
              1,

            historicalRecoverer:
              1,

            serialFailer:
              1,

            state:
              1,

            fallback_active:
              1,
          })
          .lean();

      res.json({
        count:
          cases.length,

        cases,
      });
    } catch (error) {
      console.error(
        "[api] case list failed",
        error
      );

      res.status(500).json({
        error:
          "Failed to load cases.",
      });
    }
  }
);

// --------------------------------------------------
// GET /cases/:caseId
//
// RevOps + Admin.
// --------------------------------------------------

app.get(
  "/cases/:caseId",
  authenticate,
  requireRole(
    "RevOps",
    "Admin"
  ),
  async (
    req,
    res
  ) => {
    try {
      const evaluationCase =
        await EvaluationCaseModel
          .findOne({
            caseId:
              req.params.caseId,
          })
          .lean();

      if (
        !evaluationCase
      ) {
        res.status(404).json({
          error:
            "Case not found.",
        });

        return;
      }

      /*
       * Do not expose raw audit records through case detail.
       */
      res.json({
        case:
          evaluationCase,
      });
    } catch (error) {
      console.error(
        "[api] case detail failed",
        error
      );

      res.status(500).json({
        error:
          "Failed to load case.",
      });
    }
  }
);

// --------------------------------------------------
// GET /cases/:caseId/decision
//
// REVOPS + ADMIN.
//
// Sanitized decision explanation.
// Raw audit remains Admin-only.
// --------------------------------------------------

app.get(
  "/cases/:caseId/decision",
  authenticate,
  requireRole(
    "RevOps",
    "Admin"
  ),
  async (
    req,
    res
  ) => {
    try {
      const decisionId =
        `${req.params.caseId}-cycle-1`;

      const explanation =
        await auditService
          .getSanitizedDecisionExplanation(
            decisionId
          );

      if (!explanation) {
        res.status(404).json({
          error:
            "Decision explanation not found.",
        });

        return;
      }

      res.json({
        explanation,
      });
    } catch (error) {
      console.error(
        "[api] decision explanation failed",
        error
      );

      res.status(500).json({
        error:
          "Failed to load decision explanation.",
      });
    }
  }
);

// --------------------------------------------------
// GET /audit/:decisionId
//
// ADMIN ONLY.
// --------------------------------------------------

app.get(
  "/audit/:decisionId",
  authenticate,
  requireRole(
    "Admin"
  ),
  async (
    req,
    res
  ) => {
    try {
      const records =
        await AuditRecordModel.find({
          decisionId:
            req.params.decisionId,
        })
          .sort({
            timestamp:
              1,
          })
          .lean();

      if (
        records.length === 0
      ) {
        res.status(404).json({
          error:
            "Decision audit not found.",
        });

        return;
      }

      res.json({
        decisionId:
          req.params.decisionId,

        count:
          records.length,

        records,
      });
    } catch (error) {
      console.error(
        "[api] audit lookup failed",
        error
      );

      res.status(500).json({
        error:
          "Failed to load audit records.",
      });
    }
  }
);

// --------------------------------------------------
// POST /cases/:caseId/approve
//
// RevOps + Admin.
// --------------------------------------------------

app.post(
  "/cases/:caseId/approve",
  authenticate,
  requireRole(
    "RevOps",
    "Admin"
  ),
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const decisionId =
        String(
          req.body?.decisionId ||
          `${req.params.caseId}-cycle-1`
        );

      const result =
        await approvalService.resolve({
          decisionId,

          caseId:
            req.params.caseId,

          actorId:
            req.user!.userId,

          role:
            req.user!.role,

          action:
            "approve",
        });

      if (
        !result.success
      ) {
        res.status(409).json(
          result
        );

        return;
      }

      res.json(result);
    } catch (error) {
      console.error(
        "[api] approve failed",
        error
      );

      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "Approval failed.",
      });
    }
  }
);

// --------------------------------------------------
// POST /cases/:caseId/override
//
// RevOps + Admin.
// --------------------------------------------------

app.post(
  "/cases/:caseId/override",
  authenticate,
  requireRole(
    "RevOps",
    "Admin"
  ),
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const overrideAction =
        req.body?.overrideAction;

      if (
        typeof overrideAction !==
        "string"
      ) {
        res.status(400).json({
          error:
            "overrideAction is required.",
        });

        return;
      }

      const decisionId =
        String(
          req.body?.decisionId ||
          `${req.params.caseId}-cycle-1`
        );

      const result =
        await approvalService.resolve({
          decisionId,

          caseId:
            req.params.caseId,

          actorId:
            req.user!.userId,

          role:
            req.user!.role,

          action:
            "override",

          overrideAction:
            overrideAction as any,
        });

      if (
        !result.success
      ) {
        res.status(409).json(
          result
        );

        return;
      }

      res.json(result);
    } catch (error) {
      console.error(
        "[api] override failed",
        error
      );

      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "Override failed.",
      });
    }
  }
);

// --------------------------------------------------
// POST /cases/:caseId/stop
//
// RevOps + Admin.
// --------------------------------------------------

app.post(
  "/cases/:caseId/stop",
  authenticate,
  requireRole(
    "RevOps",
    "Admin"
  ),
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const decisionId =
        String(
          req.body?.decisionId ||
          `${req.params.caseId}-cycle-1`
        );

      const result =
        await approvalService.resolve({
          decisionId,

          caseId:
            req.params.caseId,

          actorId:
            req.user!.userId,

          role:
            req.user!.role,

          action:
            "stop",
        });

      if (
        !result.success
      ) {
        res.status(409).json(
          result
        );

        return;
      }

      res.json(result);
    } catch (error) {
      console.error(
        "[api] stop failed",
        error
      );

      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "Stop failed.",
      });
    }
  }
);

// --------------------------------------------------
// GET /experiments/:runId/metrics
//
// ADMIN ONLY.
// --------------------------------------------------

app.get(
  "/experiments/:runId/metrics",
  authenticate,
  requireRole(
    "Admin"
  ),
  async (
    req,
    res
  ) => {
    try {
      const runId =
        req.params.runId;

      if (
        runId !==
        "day5-current"
      ) {
        res.status(404).json({
          error:
            "Experiment run not found.",
        });

        return;
      }

      const metrics =
        await metricsService
          .computeExperimentMetrics();

      res.json({
        runId,
        metrics,
      });
    } catch (error) {
      console.error(
        "[api] experiment metrics failed",
        error
      );

      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to calculate experiment metrics.",
      });
    }
  }
);

// --------------------------------------------------
// POST /experiments/run
//
// ADMIN ONLY.
// --------------------------------------------------

app.post(
  "/experiments/run",
  authenticate,
  requireRole(
    "Admin"
  ),
  async (
    _req,
    res
  ) => {
    try {
      res.status(409).json({
        error:
          "A controlled Day 5 experiment already exists. Start a new experiment only through the explicit experiment-generation workflow; the current fixed batch will not be regenerated by accident.",
      });
    } catch (error) {
      console.error(
        "[api] experiment run failed",
        error
      );

      res.status(500).json({
        error:
          "Experiment run failed.",
      });
    }
  }
);

// --------------------------------------------------
// COMPATIBILITY ROUTES
// --------------------------------------------------

app.get(
  "/api/cases",
  authenticate,
  requireRole(
    "RevOps",
    "Admin"
  ),
  async (
    _req,
    res
  ) => {
    try {
      const cases =
        await EvaluationCaseModel.find({
          caseId:
            /^eval-/,
        })
          .sort({
            caseId:
              1,
          })
          .select({
            _id:
              0,

            caseId:
              1,

            declineCategory:
              1,

            hardSoft:
              1,

            valueTier:
              1,

            amountAtRisk:
              1,

            attemptNumber:
              1,

            timeRemainingDays:
              1,

            historicalRecoverer:
              1,

            serialFailer:
              1,

            state:
              1,

            fallback_active:
              1,
          })
          .lean();

      res.json({
        count:
          cases.length,

        cases,
      });
    } catch {
      res.status(500).json({
        error:
          "Failed to load cases.",
      });
    }
  }
);

app.get(
  "/api/cases/:caseId",
  authenticate,
  requireRole(
    "RevOps",
    "Admin"
  ),
  async (
    req,
    res
  ) => {
    try {
      const evaluationCase =
        await EvaluationCaseModel
          .findOne({
            caseId:
              req.params.caseId,
          })
          .lean();

      if (
        !evaluationCase
      ) {
        res.status(404).json({
          error:
            "Case not found.",
        });

        return;
      }

      res.json({
        case:
          evaluationCase,
      });
    } catch {
      res.status(500).json({
        error:
          "Failed to load case.",
      });
    }
  }
);

// --------------------------------------------------
// RAZORPAY WEBHOOK
// --------------------------------------------------

app.post(
  "/webhooks/razorpay",
  (req, res) => {
    console.log(
      "\n=== RAZORPAY WEBHOOK RECEIVED ==="
    );

    console.log(
      "Headers:",
      req.headers
    );

    console.log(
      "Body:",
      JSON.stringify(
        req.body,
        null,
        2
      )
    );

    res.status(200).json({
      received:
        true,
    });
  }
);

// --------------------------------------------------
// ERROR HANDLER
// --------------------------------------------------

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error(
      "[api] unhandled error",
      error
    );

    res.status(500).json({
      error:
        "Internal server error.",
    });
  }
);

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

async function startServer() {
  await connectMongo();

  app.listen(
    PORT,
    () => {
      console.log(
        `DecisionRail backend running on http://localhost:${PORT}`
      );

      console.log(
        "Roles: RevOps / Admin"
      );

      console.log(
        "RBAC: RevOps=operational, Admin=operational+audit+experiment"
      );
    }
  );
}

startServer().catch(
  async (error) => {
    console.error(
      "[server] failed to start",
      error
    );

    try {
      await disconnectMongo();
    } catch {}

    process.exit(1);
  }
);