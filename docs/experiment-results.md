# DecisionRail — Experiment Results

> **Synthetic / seeded / test-mode results — not real-world Razorpay performance.**

## 1. Executive Result

DecisionRail recovered **₹156,478** versus **₹146,614** for the fixed T+1/T+2/T+3 baseline on the same 200-case synthetic evaluation batch.

That represents:

- **₹9,864 incremental recovered amount**
- **+8.50 percentage points** recovery-rate improvement
- **6.73%** relative recovered-amount improvement

The measured DecisionRail guardrails were not worse than baseline in this experiment: unnecessary write-off was **0.00%** for DecisionRail versus **42.857%** for baseline.

The exact false-escalation rate is **not yet available**, because none of the 50 DecisionRail escalation decisions currently has a recorded human resolution.

---

## 2. Experiment Setup

The experiment uses a controlled synthetic environment:

- **5,000** synthetic training rows
- **200** synthetic evaluation cases
- A hidden **PotentialOutcomes** table
- Seeded, deterministic outcomes for each case/action pair
- A separate fixed evaluation batch from the training corpus
- The model does not receive hidden outcomes
- Metrics consult hidden outcomes only after a policy selects an action

The baseline is the project's faithful fixed **T+1/T+2/T+3** subscription retry policy.

---

## 3. Why the Comparison Is Fair

The comparison is designed so the policy is the only meaningful variable:

1. DecisionRail and baseline use the **same 200 evaluation cases**.
2. Both use the **same hidden PotentialOutcomes records**.
3. Outcomes are seeded and deterministic.
4. Hidden outcomes are not regenerated during metric calculation.
5. No separate re-sampling or cherry-picking is used.
6. Recovery is scored from the action each policy actually selected.

This prevents one policy from receiving a different random outcome world than the other.

---

## 4. DecisionRail vs Baseline Results

| Metric | DecisionRail | Baseline |
|---|---:|---:|
| Recovered amount | **₹156,478** | ₹146,614 |
| Recovered cases | **78** | 61 |
| Recovery rate | **39.00%** | 30.50% |
| Selected cases | 200 | 200 |
| Retry cases | 99 | 130 |
| Stop cases | 51 | 70 |
| Escalation cases | 50 | 0 |
| Unnecessary write-off rate | **0.00%** | 42.857% |

### Incremental Results

| Metric | Result |
|---|---:|
| Incremental recovered amount | **₹9,864** |
| Recovery-rate improvement | **+8.50 percentage points** |
| Relative recovered-amount improvement | **6.73%** |
| Wasted retries avoided | **31** |
| High-value accounts saved | **6** |

---

## 5. Guardrail Metrics

### Unnecessary Write-Off

DecisionRail:

**0.00%**

Baseline:

**42.857%**

In this synthetic experiment, DecisionRail did not materially worsen this guardrail; it was substantially lower than baseline.

### False Escalation

DecisionRail:

**Insufficient data**

The exact metric is not yet available because **0 of 50 DecisionRail escalation decisions** currently have recorded human resolutions.

The experiment does not estimate false escalation from unresolved cases. The exact rate becomes available only after all 50 escalation decisions receive recorded human outcomes.

---

## 6. Failure-Injection Verification

The Day 7 failure harness passed all required scenarios:

| Failure scenario | Result |
|---|---|
| Estimator unavailable | **PASS** |
| Duplicate event | **PASS** |
| Audit write failure | **PASS** |
| Approval race condition | **PASS** |
| Batch regeneration / cherry-picking | **PASS** |

### Live Failure Demonstration

The live estimator-unavailable scenario produced:

```text
Estimator unavailable
        ↓
Deterministic category-prior fallback
        ↓
Probability = 0.50
Confidence = 0.35
        ↓
Automatic execution blocked
        ↓
Awaiting Human Approval
        ↓
Audit record retained
