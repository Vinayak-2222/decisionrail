# DecisionRail — Experiment Results

> **Synthetic / seeded / test-mode results — not real-world Razorpay performance.**

## 1. Executive Result

DecisionRail recovered **₹156,265** versus **₹146,614** for the fixed T+1/T+2/T+3 baseline on the same 200-case synthetic evaluation batch.

That represents:

- **₹9,651 incremental recovered amount**
- **+8.00 percentage points** recovery-rate improvement
- **6.58%** relative recovered-amount improvement

The measured DecisionRail guardrails were not worse than baseline in this experiment: unnecessary write-off was **0.00%** for DecisionRail versus **42.857%** for baseline, and the resolved false-escalation rate was **0.00%**.

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
| Recovered amount | **₹156,265** | ₹146,614 |
| Recovered cases | **77** | 61 |
| Recovery rate | **38.50%** | 30.50% |
| Selected cases | 200 | 200 |
| Retry cases | 99 | 130 |
| Stop cases | 53 | 70 |
| Escalation cases | 48 | 0 |
| Unnecessary write-off rate | **0.00%** | 42.857% |

### Incremental Results

| Metric | Result |
|---|---:|
| Incremental recovered amount | **₹9,651** |
| Recovery-rate improvement | **+8.00 percentage points** |
| Relative recovered-amount improvement | **6.58%** |
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

**0.00%**

The metric became available only after all **48 DecisionRail escalation decisions** received recorded human resolutions.

The final calculation therefore uses recorded human outcomes rather than an estimate based on unresolved cases.

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
```

Verified live values:

```text
injection          = estimator_unavailable
fallbackApplied    = true
fallbackProbability= 0.50
fallbackConfidence = 0.35
resultingState     = Awaiting Human Approval
executed           = false
```

The audit record also captured:

```text
fallbackActive     = true
fallbackStrategy   = deterministic_category_prior
safeResolution     = human_approval_required
injectedFailure    = estimator_unavailable
```

---

## 7. Interpretation of Results

DecisionRail selected actions based on recovery likelihood, expected value, and policy constraints rather than applying the same retry behavior to every case.

In this seeded synthetic environment, that decision-aware approach recovered more simulated revenue than the fixed baseline while also producing lower measured unnecessary write-offs.

The result is especially useful as a demonstration of the system's **decisioning methodology**, rather than as a claim about real production payment recovery.

Operational counts such as automatic executions and human-approval cases are reported separately from policy-efficacy scoring. The experiment score is determined by the selected action and the corresponding precomputed hidden outcome.

---

## 8. What the Results Prove

The experiment demonstrates that:

- DecisionRail can run end-to-end on a fixed evaluation batch.
- The baseline and DecisionRail can be compared on identical cases and identical hidden outcomes.
- DecisionRail can produce a higher recovered-₹ result than the fixed baseline in the simulated environment.
- Guardrail metrics can be measured explicitly rather than assumed.
- Failure scenarios can degrade safely instead of silently executing an unsafe action.
- Human approval and auditability remain part of the recovery workflow.
- The experiment is reproducible because the evaluation world is seeded and fixed.

---

## 9. What the Results Do NOT Prove

These results do **not** prove:

- real-world Razorpay recovery performance,
- production uplift for merchants,
- production customer behavior,
- production conversion or recovery rates,
- that the synthetic model generalizes to live payment traffic.

The model is trained and evaluated using synthetic data, and the potential outcomes are simulated.

> **These results demonstrate the behavior and methodology of the DecisionRail MVP in a seeded synthetic environment. They are not evidence of real-world Razorpay production performance.**

---

## 10. Reproducibility / Integrity Controls

The evaluation includes explicit integrity checks:

- **200** evaluation cases exist.
- **200** hidden outcome records exist.
- Evaluation and hidden-outcome case IDs match.
- The evaluation batch did not change during metric calculation.
- Hidden PotentialOutcomes did not change during metric calculation.
- No dataset generation was triggered by the full pipeline regression.
- No cherry-picking was detected.
- The hidden outcome table is consulted after policy selection rather than regenerated at decision time.

Integrity test result:

```text
BATCH INTEGRITY TEST: SUCCESS
```

---

## 11. Pipeline Verification

The direct full-pipeline verification processed:

- **200** cases
- **82** automatic executions
- **75** human-approval cases
- **43** stopped cases
- **38** recovered cases
- **₹25,649** recovered in direct pipeline verification

The full pipeline also confirmed:

```text
all 200 existing evaluation cases processed
existing evaluation batch was used
no dataset generation was triggered
DAY 5 PIPELINE: SUCCESS
```

These operational figures are separate from the final policy-efficacy experiment metrics above.

---

## 12. Final Conclusion

DecisionRail satisfies the MVP success condition **within the controlled synthetic experiment**:

**DecisionRail recovered more simulated revenue than the fixed T+1/T+2/T+3 baseline, while the measured DecisionRail guardrails were not worse.**

Final experiment result:

```text
DecisionRail recovered:  ₹156,265
Baseline recovered:      ₹146,614
Incremental recovery:      ₹9,651
Recovery improvement:       +8.00 pp
Unnecessary write-off:       0.00%
False escalation:            0.00%
```

The experiment is deliberately controlled, seeded, auditable, and reproducible.

> **These results demonstrate the behavior and methodology of the DecisionRail MVP in a seeded synthetic environment. They are not evidence of real-world Razorpay production performance.**
