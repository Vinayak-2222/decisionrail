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
Razorpay / Payment Failure
          ↓
Event Ingestion
          ↓
Classification + Context
          ↓
Recovery Likelihood
          ↓
Expected Value (EV)
          ↓
Policy / Guardrails
          ↓
Decision
     ↙           ↘
Human             Simulated
Approval          Execution
  ↓                    ↓
Approve /            Outcome
Override /               ↓
Stop                  Audit
     \                /
      \              /
         ↓          ↓
             Metrics
```

The Razorpay boundary is an ingestion boundary only; recovery execution remains simulated in the MVP.

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

The hidden outcomes are consulted only for post-decision experiment scoring. DecisionRail and the baseline are scored from the action each policy selected on the same cases.

## 8. Results

> **Synthetic / seeded / test-mode results — not real-world Razorpay performance.**

| Metric | DecisionRail | Baseline |
|---|---:|---:|
| Recovered | ₹156,478 | ₹146,614 |
| Recovery rate | 39.00% | 30.50% |
| Recovered cases | 78 | 61 |
| Retry cases | 99 | 130 |
| Stop cases | 51 | 70 |
| Escalation cases | 50 | 0 |
| Unnecessary write-off | 0.00% | 42.86% |
| False escalation | Insufficient data | — |

**Incremental recovered:** ₹9,864  
**Recovery improvement:** +8.5 percentage points  
**Relative recovered-amount improvement:** +6.73%  
**Wasted retries avoided:** 31  
**High-value accounts saved:** 6

False escalation is currently **not claimable as a final rate**: 0 of 50 DecisionRail escalation decisions have recorded human resolutions. Exact false-escalation measurement remains insufficient until those resolutions are recorded.

The experiment reports policy-efficacy metrics separately from operational execution counts. The current experiment metrics therefore show `executedCases: 0` while selected actions are still scored against the precomputed hidden outcomes.

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

The project contains a **Razorpay Test Mode webhook boundary** for supported payment events, with signature verification and idempotent ingestion. The MVP does **not** use the Razorpay SDK for payment execution.

A complete end-to-end flow from a successful/failed live Razorpay Test Mode subscription checkout through a real webhook into a real payment recovery has **not** been demonstrated. Recovery execution is simulated/controlled in the MVP.

Therefore, the project does **not** claim real Razorpay payment recovery or real-money movement.

## 11. Current MVP Status

**Demo-ready MVP**

The implementation includes a working dashboard, Decision Experience, Human Approval Queue with Approve/Override/Stop controls, baseline comparison, audit trail, experiment metrics, failure-injection tests, and a live graceful-fallback demonstration.

The product boundary is intentionally limited to decisioning and controlled/simulated execution. It does not include production money movement, real customer communication, checkout recovery, B2B invoice recovery, chatbot functionality, contextual-bandit/online-learning behavior, or production-scale real payment retry execution.

All experiment results are explicitly treated as synthetic/test-mode results rather than real-world Razorpay performance.
