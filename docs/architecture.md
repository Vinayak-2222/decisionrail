# DecisionRail — Technical Architecture

## 1. Problem / Goal

DecisionRail is a decisioning layer for failed subscription payments that determines the highest-value safe recovery action before the retry window closes, combining recovery-likelihood estimation, expected value, policy guardrails, human approval, simulated execution, auditability, and baseline comparison.

## 2. Architecture Style

DecisionRail uses a **modular monolith**:

- **Backend:** Node.js + Express + TypeScript
- **Frontend:** React + TypeScript + Vite
- **Database:** MongoDB
- **Infrastructure:** Docker Compose; Redis is part of the architecture
- **Execution:** simulated only; no real payment movement or customer communication

Core modules are separated internally by stable interfaces rather than independent services.

## 3. Core Data Flow

```text
Payment Failure
      ↓
Classification
      ↓
Context
      ↓
Recovery Likelihood
      ↓
Expected Value (EV)
      ↓
Policy / Guardrails
      ↓
Decision
   ↙       ↘
Human      Simulated
Approval   Execution
   ↓           ↓
Approve/     Outcome
Override/       ↓
Stop          Audit
      \        /
       ↓      ↓
         Metrics
```

## 4. AI Boundary

The AI layer is deliberately narrow:

```text
Deterministic decline-category prior
                    +
          Logistic regression
                    ↓
     P(recovery | action, context)
```

The estimator only produces recovery probabilities and confidence. It cannot classify declines, enforce policy, calculate EV, manage state, execute actions, or write audit records.

When the estimator is unavailable or malformed, DecisionRail falls back to the deterministic category prior, lowers confidence, and prevents unsafe automatic execution.

## 5. Decision Logic

```text
EV(action) =
P(recovery | action, context) × amount_at_risk
− action_cost(action)
```

Policy filters candidate actions before execution authorization. Customer value tier is a separate policy signal and is not folded into the recovered-₹ calculation.

## 6. Safety / Reliability

DecisionRail includes:

- explicit policy authorization before execution
- human approval for flagged decisions
- enforced state transitions
- idempotency and duplicate-event protection
- approval race-condition protection
- append-only audit records
- safe estimator fallback
- simulated execution with failure handling

## 7. Experiment Architecture

The controlled experiment uses:

- **5,000** synthetic training rows
- **200** synthetic evaluation cases
- a hidden **PotentialOutcomes** table
- deterministic seeded outcomes
- the identical evaluation batch for DecisionRail and baseline
- the identical hidden outcomes for both policies
- no outcome regeneration during metric calculation
- no cherry-picking

The hidden outcomes are consulted only for post-decision experiment scoring.

## 8. Results

> **Synthetic / seeded / test-mode results — not real-world Razorpay performance.**

| Metric | DecisionRail | Baseline |
|---|---:|---:|
| Recovered | ₹156,265 | ₹146,614 |
| Recovery rate | 38.50% | 30.50% |
| Unnecessary write-off | 0.00% | 42.86% |
| False escalation | 0.00% | — |

**Incremental recovered:** ₹9,651  
**Recovery improvement:** +8.0 percentage points

False escalation became measurable after all 48 DecisionRail escalation decisions received recorded human resolutions.

## 9. Failure Injection

Tested scenarios:

- estimator unavailable
- duplicate event
- audit write failure
- approval race
- batch integrity / cherry-picking
- live estimator fallback

Live fallback path:

```text
Estimator unavailable
        ↓
Deterministic fallback
        ↓
Confidence reduced
        ↓
Automatic execution blocked
        ↓
Human approval required
        ↓
Audit retained
```

## 10. Razorpay Integration Status

The project contains a **Razorpay/webhook-shaped ingestion boundary**.

A complete end-to-end flow from a live Razorpay Test Mode subscription failure through a real Razorpay webhook into DecisionRail has **not** been demonstrated.

Therefore, the project does not claim full live Razorpay integration.

## 11. Current MVP Status

**Demo-ready MVP**

The implementation includes a working dashboard, Decision Experience, Human Approval Queue with Approve/Override/Stop controls, baseline comparison, audit trail, experiment metrics, failure-injection tests, and a live graceful-fallback demonstration.

All experiment results are explicitly treated as synthetic/test-mode results rather than real-world Razorpay performance.
