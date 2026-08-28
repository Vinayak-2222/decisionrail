# DecisionRail — 5-Minute Demo Script

## Goal

Demonstrate the complete DecisionRail story in five minutes:

```text
Risk → Decision → Explainability → Human Control → Results → Failure Recovery → Audit
```

> **Important:** All experiment results shown in this demo are synthetic, seeded, and test-mode results. They are not real-world Razorpay performance claims.

---

## 0:00–0:30 — Problem / Hook

### Screen
Login → Recovery Overview

### Say

> “A failed subscription payment does not automatically mean lost revenue. The challenge is deciding what to do next without blindly retrying every payment the same way.
>
> DecisionRail is a decisioning layer that chooses the highest-value safe recovery action while keeping policy, human control, and auditability around that decision.”

Point briefly to the **SYNTHETIC / TEST MODE** label.

---

## 0:30–1:00 — Recovery Overview

### Screen
**Recovery Overview**

Show:

- evaluation cases
- cases awaiting approval
- retry-scheduled cases
- stopped cases
- high-priority cases needing attention

### Say

> “This is the operational command center. It tells a RevOps user which payments need attention and where each case currently sits in the recovery workflow.”

Then click:

**At-Risk Payments**

---

## 1:00–2:00 — Decision Experience

### Screen
Open:

**At-Risk Payments → eval-0000 → Decision Experience**

Verified example:

```text
Amount at risk:        ₹1,624
Decline:               insufficient_funds
Attempt:               2/3
Chosen action:         retry_now
```

### Show Recovery Likelihood

```text
retry_now:      47.4%
retry_later:    40.1%
notify_only:    30.7%
escalate:       46.9%
stop:           28.2%
```

### Show Expected Value

```text
retry_now:      ₹768
retry_later:    ₹649
notify_only:    ₹493
escalate:       ₹721
stop:           ₹457
```

### Say

> “The model estimates recovery likelihood for each action. It does not decide policy or execute anything.
>
> Policy first determines which actions are allowed. Then Expected Value compares the permitted actions.
>
> For this case, retry_now has the highest expected value at ₹768, so that becomes the recommended action.”

Scroll far enough to show the **Safety gates** section.

### Say

> “The important part is that the AI is bounded. The policy and safety gates remain in control of what can actually happen.”

---

## 2:00–2:45 — Human Control

### Screen
Click:

**Approval Queue**

Open a case showing:

**Awaiting Human Approval**

Demonstrate one real action:

**Approve**

### Say

> “When a decision crosses a human-review gate, it does not execute automatically. It appears here for RevOps review.
>
> The operator can approve the recommendation, override it with another permitted action, or stop the recovery.”

Click **Approve**.

Show:

> **Human action applied successfully.**

### Say

> “That action is persisted through the real API and recorded in the decision audit trail.”

---

## 2:45–3:30 — Baseline Comparison

### Screen
Switch to the **Admin** account if needed.

Open:

**Baseline Comparison**

Show:

```text
DecisionRail recovered:   ₹156,265
Baseline recovered:       ₹146,614
Incremental recovered:      ₹9,651
Recovery improvement:       +8.0 pp
Wasted retries avoided:          31
```

Show the guardrails:

```text
DecisionRail unnecessary write-off:  0.00%
Baseline unnecessary write-off:     42.857%

False escalation:                    0.00%
```

### Say

> “Now we can ask whether DecisionRail is actually better.
>
> On the identical 200-case seeded evaluation batch, DecisionRail recovered ₹156,265 versus ₹146,614 for the fixed baseline.
>
> That's ₹9,651 of incremental simulated recovery and an eight percentage-point recovery-rate improvement.
>
> Just as importantly, the measured guardrails were not worse.”

Point clearly to:

> **Synthetic / test-mode: these results come from a seeded simulated world and are not a real-world Razorpay performance benchmark.**

### Say

> “These are controlled synthetic results, not a claim about production Razorpay performance.”

---

## 3:30–4:15 — Live Failure Injection

### Screen
Use the already-running backend.

In PowerShell, with an Admin session:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:4000/admin/failure-injection/estimator `
  -Headers $adminHeaders
```

### Expected result

```text
success             : True
injection           : estimator_unavailable
fallbackApplied     : True
fallbackProbability : 0.5
fallbackConfidence  : 0.35
resultingState      : Awaiting Human Approval
safeResolution      : Human approval required; automatic execution blocked.
```

### Say

> “Now I'll intentionally make the estimator unavailable.
>
> DecisionRail does not silently fail open. It uses the deterministic category-prior fallback, lowers confidence, blocks automatic execution, and routes the case to human approval.”

Pause briefly on the output.

---

## 4:15–4:45 — Audit Proof

### Screen

Look up:

```text
DAY7-FALLBACK-001-cycle-1
```

Use the Admin audit endpoint:

```powershell
$decisionId = "DAY7-FALLBACK-001-cycle-1"

Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/audit/$decisionId" `
  -Headers $adminHeaders |
  ConvertTo-Json -Depth 20
```

Point to:

```text
fallbackActive      : true
injectedFailure     : estimator_unavailable
fallbackStrategy    : deterministic_category_prior
safeResolution      : human_approval_required
executed            : false
resultingState      : Awaiting Human Approval
```

### Say

> “And the failure is not just handled — it is auditable. The record tells us exactly what failed, what fallback was used, why automatic execution was blocked, and what state the case ended in.”

---

## 4:45–5:00 — Closing

### Say

> “DecisionRail is not an AI that blindly retries payments.
>
> It is a bounded decisioning layer: it estimates recovery likelihood, applies deterministic safety policy, chooses the highest-value permitted action, keeps humans in control when needed, and measures the result against a fixed baseline.
>
> The MVP is fully demoable in a controlled synthetic environment, with explainability, guardrails, failure recovery, and auditability built into the workflow.”

---

# Backup Narration

## If an API call takes a few seconds

Say:

> “This action is going through the backend API and persistence layer. The important part is that the UI is reflecting the persisted decision rather than only changing local state.”

Do not repeatedly refresh during the recording unless necessary.

---

## If the selected case is already resolved

Choose another case in **Approval Queue** with:

```text
Awaiting Human Approval
```

Do not reset the experiment during the recording.

---

## If queue counts change

Say:

> “The queue is operational and changes as human actions are applied. The paired experiment metrics remain fixed to preserve experiment integrity.”

---

## If the comparison screen shows different operational counts

Explain:

> “Operational case state can change through human actions, but the policy comparison remains tied to the fixed seeded evaluation batch and its hidden outcomes.”

---

# Demo Checklist Before Recording

## Backend

Confirm:

```powershell
npm run build
```

passes.

Confirm backend is running:

```text
http://localhost:4000
```

## Frontend

Confirm:

```powershell
npm run build
npm run dev
```

passes and the application opens at:

```text
http://localhost:5173
```

## Browser

Have ready:

- RevOps login
- Admin login
- Recovery Overview
- At-Risk Payments
- `eval-0000`
- Approval Queue
- Baseline Comparison

## Failure Injection

Have ready:

- Admin `$adminHeaders`
- live estimator injection command
- audit lookup command

## Demo Rules

- Keep **SYNTHETIC / TEST MODE** visible where possible.
- Do not call simulated execution “real payment recovery.”
- Do not claim full live Razorpay Test Mode integration.
- Do not claim the synthetic uplift predicts production results.
- Do not open source code unless the interviewer specifically asks.
- Prefer showing the product behavior over explaining implementation details.
