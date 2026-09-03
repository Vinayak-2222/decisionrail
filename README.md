**# DecisionRail**

**### Razorpay AI Buildathon 2026 — Track 3: AI Revenue Recovery**

\> **\*\*DecisionRail chooses the highest-value safe recovery action for an at-risk subscription payment before the retry window closes — with explainability, policy guardrails, human approval, auditability, and baseline measurement built in.\*\***

\> **\*\*Synthetic / seeded / test-mode experiment — not a real-world Razorpay performance benchmark.\*\***

**---**

**## What is DecisionRail?**

A failed subscription payment does not automatically mean the revenue is lost. A fixed retry policy treats many failures similarly, even though different payments have different recovery likelihoods, retry histories, values, and time remaining.

DecisionRail adds a decisioning layer that:

1\. understands the payment context,

2\. estimates recovery likelihood for candidate actions,

3\. calculates expected value,

4\. applies hard safety and policy constraints,

5\. automatically executes only safe in-policy actions,

6\. routes higher-risk cases to a human,

7\. records the full reasoning and lifecycle in an append-only audit trail, and

8\. compares results against a fixed T+1/T+2/T+3 baseline on the same synthetic experiment.

**---**

**## Core Decision Flow**

\`\`\`text

Payment failure

      ↓

Validation / classification

      ↓

Context construction

      ↓

Recovery-likelihood estimation

      ↓

Expected Value calculation

      ↓

Policy / guardrails

      ↓

Decision

   ↙       ↘

Human      Safe simulated

approval   execution

   ↓           ↓

Approve /      Outcome

Override /        ↓

Stop           Audit

      \          /

        ↓

      Metrics

\`\`\`

**---**

**## Key Design Principles**

**### AI has one responsibility**

The recovery-likelihood estimator is the only AI component. It estimates:

\`P(recovery | action, context)\`

It does **\*\*not\*\*** classify declines, calculate EV, enforce policy, manage state, execute actions, or write audit records.

**### Policy controls execution**

The Policy Engine filters candidate actions before decision execution and writes the authorization required by the Action Executor.

**### High-risk cases stay human-controlled**

High-value, low-confidence, and other policy-flagged decisions can be routed to the Human Approval Queue.

**### Auditability is first-class**

Decisions capture the inputs, probabilities, EVs, policy checks, versions, execution result, and resulting state.

**### Idempotency prevents duplicate work**

Stable case/decision identities prevent duplicate decisions, duplicate execution, and duplicate audit records.

**### The experiment uses one fixed world**

Baseline and DecisionRail are evaluated against the same 200-case batch and the same precomputed hidden PotentialOutcomes table.

**### Failure should degrade safely**

When estimation fails, the deterministic category prior is used, confidence is reduced, and an otherwise automatic decision is held for human approval.

**---**

**## Architecture**

DecisionRail is implemented as a **\*\*modular monolith\*\***:

\`\`\`text

React + TypeScript frontend

           │

           ▼

Node.js + Express + TypeScript backend

           │

 ┌─────────┼────────────────────────────────────────────┐

 │         │            │           │                    │

 ▼         ▼            ▼           ▼                    ▼

Classifier Context   Likelihood     EV             Policy / Guardrails

                     Estimator      Engine               │

                                                          ▼

                                             State Manager / Executor

                                                          │

                                     ┌────────────────────┴───────────┐

                                     ▼                                ▼

                              Human Approval                     Audit Service

                                                                      │

                                                                      ▼

                                                               Metrics Service

                                                                      │

                                                                      ▼

                                                               Baseline Simulator

MongoDB stores application/evaluation data and audit records.

Redis is included in the Docker Compose architecture.

\`\`\`

**### Main components**

\- **\*\*Synthetic Generator\*\*** — creates the disclosed training corpus and evaluation batch.

\- **\*\*Decline Classifier\*\*** — deterministic classification of decline reasons.

\- **\*\*Context Builder\*\*** — assembles value tier, retry history, and time remaining.

\- **\*\*Likelihood Estimator\*\*** — deterministic prior + calibrated logistic regression.

\- **\*\*EV Engine\*\*** — calculates expected value for permitted actions.

\- **\*\*Policy Engine\*\*** — applies hard rules and human-approval gates.

\- **\*\*State Manager\*\*** — enforces valid lifecycle transitions.

\- **\*\*Action Executor\*\*** — simulated execution only.

\- **\*\*Human Approval Service\*\*** — Approve / Override / Stop workflow.

\- **\*\*Audit Service\*\*** — append-only decision and lifecycle history.

\- **\*\*Metrics Service\*\*** — evaluates DecisionRail vs baseline.

\- **\*\*Baseline Simulator\*\*** — fixed T+1/T+2/T+3 comparison.

\- **\*\*Frontend\*\*** — operational dashboard and explainability experience.

**---**

**## AI / Recovery-Likelihood Estimator**

The estimator uses a **\*\*deterministic decline-category prior refined by logistic regression\*\***.

This design was chosen because it gives:

\- explainable probabilities,

\- deterministic behavior,

\- a frozen/versioned model,

\- straightforward calibration checking,

\- and a safe fallback when model inputs are missing or the model fails.

The fallback is the configured category prior. It is deliberately conservative and never silently turns a failed model call into an unguarded automatic action.

The estimator cannot directly call the executor or bypass policy.

**---**

**## Expected Value**

For each policy-permitted action:

\`\`\`text

EV(action) =

P(recovery | action, context) × amount\_at\_risk

− action\_cost(action)

\`\`\`

\`amount\_at\_risk\` is the sole rupee multiplier in the EV calculation.

Customer value tier is kept separate and is used as a policy signal, for example to require human approval for high-value accounts. It is not silently folded into the claimed recovered-₹ figure.

**---**

**## Synthetic Experiment Design**

The experiment is intentionally controlled and reproducible.

**### Training**

\- 5,000 synthetic failure-action-outcome rows

\- used for offline logistic-regression training

\- separate from the evaluation batch

**### Evaluation**

\- 200 synthetic failed-payment cases

\- small enough for case-level inspection

\- large enough for aggregate comparison

**### Hidden PotentialOutcomes**

For every evaluation case, a hidden table contains the precomputed potential outcome for each candidate action.

The outcomes are generated once using deterministic seeded logic.

The policy does not see these hidden outcomes during decision-making. The Metrics Service reads the already-generated outcomes after a decision is selected.

**### Anti-cherry-picking controls**

\- same 200 evaluation cases,

\- same hidden outcome records,

\- identical case IDs,

\- no regeneration during metric calculation,

\- hidden outcomes remain unchanged,

\- no separate re-sampling for baseline vs DecisionRail.

**---**

**## Baseline Comparison**

The baseline models the fixed subscription retry behavior represented in the project as:

\`\`\`text

T+1 → T+2 → T+3

\`\`\`

It is intentionally simple and fixed so that DecisionRail can be compared against a consistent non-adaptive policy on the exact same synthetic world.

**---**

**## Current Measured Results**

\> **\*\*Synthetic / seeded / test-mode experiment — not a real-world Razorpay benchmark.\*\***

\| Metric | DecisionRail | Baseline |

\|---|---:|---:|

\| Recovered amount | ₹156,478 | ₹146,614 |

\| Recovery rate | 39.00% | 30.50% |

\| Unnecessary write-off rate | 0.00% | 42.86% |

\| False-escalation rate | Insufficient data | — |

\| Selected cases | 200 | 200 |

**### Incremental impact**

\| Metric | Result |

\|---|---:|

\| Incremental recovered amount | **\*\*₹9,864\*\*** |

\| Recovery-rate improvement | **\*\*+8.50 percentage points\*\*** |

\| Relative recovered-amount improvement | **\*\*6.73%\*\*** |

\| Wasted retries avoided | **\*\*31\*\*** |

\| High-value accounts saved | **\*\*6\*\*** |

False-escalation is currently insufficient to measure: 0 of 50 DecisionRail escalation decisions have recorded human resolutions.

These numbers are experiment results from the seeded synthetic environment. They are not claims about production Razorpay performance.

**---**

**## Human Approval**

The Human Approval Queue supports:

\- **\*\*Approve\*\*** — accept the recommended human-gated action.

\- **\*\*Override\*\*** — choose a different permitted action.

\- **\*\*Stop\*\*** — stop the recovery path.

The approval flow is protected against concurrent decisions. In a race, one approval wins and the competing approval is rejected rather than silently overwriting the first resolution.

Every human action is recorded with the actor identity, role, action, and resulting state.

**---**

**## Failure Handling**

The project includes executable failure-injection and reliability checks for the five critical failure scenarios:

\- estimator unavailable,

\- duplicate event,

\- audit write failure,

\- approval race condition,

\- batch regeneration / cherry-picking.

**### Live fallback demonstration**

A live estimator-unavailable injection produced:

\`\`\`text

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

\`\`\`

The corresponding audit record captured:

\- \`fallbackActive = true\`

\- \`injectedFailure = estimator\_unavailable\`

\- \`fallbackStrategy = deterministic\_category\_prior\`

\- \`safeResolution = human\_approval\_required\`

\- \`executed = false\`

\- \`resultingState = Awaiting Human Approval\`

This is deliberate graceful degradation rather than silent failure.

**---**

**## Verified Test Results**

**### Build verification**

Backend:

\`\`\`bash

npm run build

\`\`\`

Frontend:

\`\`\`bash

npm run build

\`\`\`

Both builds pass.

**### Pipeline verification**

The full DecisionRail pipeline processed:

\- 200 cases

\- 82 automatic executions

\- 77 human-approval cases

\- 41 stopped cases

\- 38 recovered cases

\- ₹25,649 recovered in direct pipeline verification

**### Batch integrity verification**

The integrity test confirmed:

\- 200 evaluation cases,

\- 200 hidden outcome records,

\- expected fixed case IDs,

\- identical case IDs across the two tables,

\- no evaluation-batch mutation during metrics,

\- no hidden-outcome mutation,

\- no cherry-picking.

**---**

**## UI / Demo**

**### Recovery Overview**

Shows the current recovery portfolio at a glance.

**### At-Risk Payments**

Provides the operational list of flagged payments.

**### Decision Experience**

The main explainability screen.

A reviewer can quickly see:

\- amount at risk,

\- decline reason,

\- attempt number,

\- recovery likelihood by action,

\- expected value by action,

\- policy / safety gates,

\- selected action.

**### Human Approval Queue**

Shows cases requiring human review and provides working:

\`\`\`text

Approve / Override / Stop

\`\`\`

actions against the real DecisionRail API.

**### Baseline Comparison**

Shows the DecisionRail vs baseline experiment with the synthetic/test-mode disclosure.

**### Recommended demo sequence**

\`\`\`text

Login

  ↓

Recovery Overview

  ↓

At-Risk Payments

  ↓

Open a case

  ↓

Decision Experience

  ↓

Approval Queue

  ↓

Approve / Override / Stop

  ↓

Baseline Comparison

  ↓

Failure Injection

  ↓

Audit trail

\`\`\`

**---**

**## Quick Start**

**### Prerequisites**

\- Node.js

\- npm

\- Docker Desktop (for Docker Compose)

\- MongoDB / Redis when running the full stack without Docker Compose

**### Backend**

\`\`\`bash

cd backend

npm install

npm run build

npm run dev

\`\`\`

Production-style start:

\`\`\`bash

npm run start

\`\`\`

**### Frontend**

Open another terminal:

\`\`\`bash

cd frontend

npm install

npm run build

npm run dev

\`\`\`

**### Useful backend commands**

Generate synthetic data:

\`\`\`bash

npm run generate

\`\`\`

Verify generated data:

\`\`\`bash

npm run generate\:verify

\`\`\`

Train the estimator:

\`\`\`bash

npm run train\:estimator

\`\`\`

Run EV tests:

\`\`\`bash

npm run test\:ev

\`\`\`

Run DecisionRail evaluation:

\`\`\`bash

npm run evaluate\:decision

\`\`\`

Run baseline evaluation:

\`\`\`bash

npm run evaluate\:baseline

\`\`\`

**### Docker Compose**

The repository includes:

\`\`\`text

docker-compose.yml

\`\`\`

It defines MongoDB, Redis, backend, and frontend containers.

A clean-machine / clean-clone Docker verification should be completed before claiming that the full stack has been independently reproduced outside the current development environment.

**---**

**## Demo Credentials**

These are local MVP/demo credentials only:

\`\`\`text

RevOps

username: revops

password: revops-demo

Admin

username: admin

password: admin-demo

\`\`\`

Do not use these credentials in a production deployment.

**---**

**## Repository Structure**

\`\`\`text

decisionrail/

├── backend/

│   ├── src/

│   │   ├── approval/

│   │   ├── audit/

│   │   ├── classifier/

│   │   ├── config/

│   │   ├── context/

│   │   ├── db/

│   │   ├── estimator/

│   │   ├── evaluation/

│   │   ├── executor/

│   │   ├── generator/

│   │   ├── integration/

│   │   ├── metrics/

│   │   ├── pipeline/

│   │   ├── policy/

│   │   └── state/

│   ├── package.json

│   └── tsconfig.json

│

├── frontend/

│   ├── src/

│   ├── package.json

│   ├── tsconfig.json

│   ├── vite.config.ts

│   └── index.html

│

└── docker-compose.yml

\`\`\`

**---**

**## MVP vs Optional**

**### MVP implemented**

\- Synthetic payment-failure dataset

\- Hidden PotentialOutcomes table

\- Deterministic decline classification

\- Context construction

\- Recovery-likelihood estimation

\- Logistic regression inference with prior fallback

\- Expected-value calculation

\- Policy / safety gates

\- State management

\- Simulated action execution

\- Human approval

\- Append-only audit records

\- Baseline comparison

\- Experiment metrics

\- Same-batch / same-hidden-outcomes validation

\- RBAC

\- Explainability dashboard

\- Failure injection

\- Live graceful-fallback demonstration

**### Optional architecture modules**

The architecture identifies these as optional extensions:

\- Adaptive State Machine

\- Portfolio-Level Escalation Budget

\- LLM-generated rationale text that decorates an already-finalized decision

**### Intentionally not implemented**

\- Real production money movement

\- Real customer communication

\- Checkout recovery

\- B2B invoice recovery

\- General-purpose chatbot

\- Contextual bandit / online learning loop

\- Microservices

\- RabbitMQ

\- Kafka

\- Kubernetes

\- LLM-driven probability / EV / action decisions

\- Editable configurable-policy UI

\- Production-scale payment retry execution

The MVP uses a Razorpay Test Mode webhook boundary. Recovery execution is simulated, no production payment is charged or moved, and a complete live end-to-end subscription-failure flow through a real Razorpay webhook was not demonstrated during development.

**---**

**## Security and Safety Boundaries**

\- Synthetic data only.

\- Two-role RBAC: RevOps and Admin.

\- Raw audit access is restricted.

\- Approval actions are tied to an authenticated actor.

\- The executor has no real payment-capture code path.

\- Customer communication is simulated only.

\- Secrets should remain in environment configuration and out of source control.

\- No production PCI-DSS, SOC 2, or other certification claim is made.

**---**

**## Current Razorpay Integration Status**

DecisionRail has a **\*\*Razorpay Test Mode webhook boundary\*\*** implemented in the backend.

The implemented webhook flow is:

\`\`\`text

Razorpay Test Mode payment.failed

        ↓

Webhook signature verification

        ↓

DecisionRail case creation / processing

        ↓

Likelihood + EV + policy decision

        ↓

Retry Scheduled / Human Approval / Stop

        ↓

Append-only audit record

\`\`\`

A later \`payment.captured\` outcome can be submitted through the same verified webhook boundary and is processed as the closed-loop recovery outcome:

\`\`\`text

payment.captured

        ↓

recoveryOutcome = recovered

        ↓

recoveredAmount persisted

        ↓

state = Recovered

        ↓

Recovery Control Center metrics updated

\`\`\`

The project does **\*\*not\*\*** claim production Razorpay integration or real-money movement. The recovery action remains simulated, and the demonstrated \`payment.captured\` outcome used during development was an explicitly controlled Test Mode/simulated webhook event. This means the project can demonstrate the integration boundary and closed-loop state tracking without claiming production payment execution.

**---**

**## Limitations**

**### Synthetic experiment**

The experiment uses seeded synthetic data and a hidden simulated world.

**### No production performance claim**

The measured recovery improvement is evidence about this controlled synthetic experiment, not a forecast of real-world Razorpay or merchant outcomes.

**### Synthetic model training**

The likelihood model is trained and evaluated using synthetic data.

**### Test Mode integration boundary**

The Razorpay Test Mode webhook boundary is implemented for failure ingestion and recovery-outcome processing. Payment execution remains simulated, and the system makes no production-money or production-performance claim.

**### Demo-oriented infrastructure**

The architecture is intentionally a buildathon-scale modular monolith rather than a production multi-service deployment.

**---**

**## Why the Experiment Is Credible**

The strongest methodological safeguards are:

1\. **\*\*Identical evaluation batch\*\*** for both policies.

2\. **\*\*Identical hidden PotentialOutcomes\*\*** for both policies.

3\. **\*\*Seeded deterministic outcomes\*\***.

4\. **\*\*No regeneration during metric calculation\*\***.

5\. **\*\*No cherry-picking\*\***.

6\. **\*\*Policy efficacy scored from the selected action\*\***.

7\. **\*\*Human resolutions recorded for false-escalation measurement\*\***.

8\. **\*\*Failure scenarios are executable tests, not documentation-only claims\*\***.

9\. **\*\*All comparison results are explicitly labeled synthetic/test-mode\*\***.

**---**

**## Submission / Interview Highlights**

**### Why logistic regression?**

It is simple, explainable, calibratable, fast, reproducible, and appropriate for the structured synthetic dataset.

**### Why Expected Value?**

Because the decision should optimize expected recovered value rather than probability alone:

\`\`\`text

Probability × amount at risk − action cost

\`\`\`

**### Why human approval?**

Some cases are too valuable, uncertain, or ambiguous to execute automatically. Human approval provides a controlled safety boundary.

**### Why hidden PotentialOutcomes?**

Without fixed counterfactual outcomes, two policies could be evaluated against different random worlds and the comparison would not be trustworthy.

**### Why modular monolith?**

The MVP workload is modest and the architecture benefits more from clear module boundaries than from distributed-service complexity.

**### How is AI prevented from bypassing policy?**

The estimator only produces probabilities. Policy filters permissible actions and the executor requires explicit policy authorization before executing.

**### How are duplicate/race/failure cases handled?**

Stable identifiers, compare-and-swap-style resolution behavior, append-only audit records, deterministic fallback, and explicit failure tests protect the lifecycle.

**---**

**## Project Status**

**\*\*MVP status: Demo-ready\*\***

The current MVP includes a Razorpay Test Mode webhook boundary for \`payment.failed\`, closed-loop recovery-outcome handling, Test Mode/controlled \`rp-\*\` case support, the synthetic DecisionRail-vs-baseline experiment, Human Approval Queue, append-only audit trail, and failure-injection checks.

The project has a working frontend, backend pipeline, explainability workflow, Human Approval Queue, baseline comparison, audit trail, failure-injection harness, and synthetic experiment.

The current benchmark result is:

\> **\*\*DecisionRail recovered ₹156,478 vs ₹146,614 for the fixed baseline on the identical synthetic evaluation batch, a ₹9,864 incremental recovery and +8.50 percentage-point recovery-rate improvement.\*\***

Again:

\> **\*\*Synthetic / seeded / test-mode experiment — not a real-world Razorpay benchmark.\*\***