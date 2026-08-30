import {
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import {
  approveCase,
  formatRupees,
  getAudit,
  getDecisionExplanation,
  getCases,
  getExperimentMetrics,
  login,
  logout,
  overrideCase,
  stopCase
} from "./api";

import type {
  ActionType,
  DecisionAudit,
  EvaluationCase,
  ExperimentMetrics,
  Role,
  User
} from "./types";

type Screen =
  | "overview"
  | "cases"
  | "queue"
  | "decision"
  | "comparison";

type DecisionAuditWithOutcome = DecisionAudit & {
  recoveryOutcome?: "pending" | "recovered" | "failed";
  recoveredAmount?: number;
  outcomeAt?: string;
  outcomeEvent?: string;
};

interface Session {
  sessionId: string;
  user: User;
}

export default function App() {
  const [session, setSession] =
    useState<Session | null>(null);

  const [screen, setScreen] =
    useState<Screen>("overview");

  const [cases, setCases] =
    useState<EvaluationCase[]>([]);

  const [
    selectedCaseId,
    setSelectedCaseId
  ] = useState<string | null>(null);

  const [
    selectedAudit,
    setSelectedAudit
  ] = useState<DecisionAuditWithOutcome | null>(null);

  const [metrics, setMetrics] =
    useState<ExperimentMetrics | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [notice, setNotice] =
    useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(
      "decisionrail-session"
    );

    if (!stored) {
      return;
    }

    try {
      setSession(
        JSON.parse(stored) as Session
      );
    } catch {
      sessionStorage.removeItem(
        "decisionrail-session"
      );
    }
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadCases();

    if (
      session.user.role === "Admin"
    ) {
      void loadMetrics();
    }
  }, [session]);

  async function loadCases() {
    if (!session) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await getCases(
        session.sessionId
      );

      setCases(response.cases);

      if (
        !selectedCaseId &&
        response.cases.length > 0
      ) {
        setSelectedCaseId(
          response.cases[0].caseId
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadMetrics() {
    if (!session) {
      return;
    }

    try {
      const data =
        await getExperimentMetrics(
          session.sessionId
        );

      setMetrics(data);
    } catch {
      // Admin-only metrics.
    }
  }

  async function openCase(
    caseId: string
  ) {
    if (!session) {
      return;
    }

    setSelectedCaseId(caseId);

    try {
      setLoading(true);
      setError(null);

      if (
        session.user.role === "Admin"
      ) {
        const result = await getAudit(
          session.sessionId,
          `${caseId}-cycle-1`
        );

        setSelectedAudit(
          result.records[
            result.records.length - 1
          ] || null
        );
      } else {
        const result =
          await getDecisionExplanation(
            session.sessionId,
            caseId
          );

        setSelectedAudit(
          result.explanation
        );
      }

      setScreen("decision");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  /*
   * IMPORTANT:
   * caseId is explicitly supplied by the caller.
   * This prevents a queue button from acting on
   * whatever case happened to be selected previously.
   */
  async function executeHumanAction(
    caseId: string,
    action:
      | "approve"
      | "override"
      | "stop",
    overrideAction?: ActionType
  ) {
    if (!session) {
      return;
    }

    const decisionId =
      `${caseId}-cycle-1`;

    try {
      setLoading(true);
      setError(null);

      if (action === "approve") {
        await approveCase(
          session.sessionId,
          caseId,
          decisionId
        );
      } else if (
        action === "override"
      ) {
        await overrideCase(
          session.sessionId,
          caseId,
          decisionId,
          overrideAction ||
            "retry_later"
        );
      } else {
        await stopCase(
          session.sessionId,
          caseId,
          decisionId
        );
      }

      setSelectedCaseId(caseId);

      setNotice(
        "Human action applied successfully."
      );

      await loadCases();

      if (
        session.user.role === "Admin"
      ) {
        await loadMetrics();
      }

      /*
       * Refresh the exact case that was acted on.
       */
      if (
        session.user.role === "Admin"
      ) {
        await openCase(caseId);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function handleLogin(
    next: Session
  ) {
    setSession(next);

    sessionStorage.setItem(
      "decisionrail-session",
      JSON.stringify(next)
    );
  }

  async function handleLogout() {
    if (session) {
      try {
        await logout(
          session.sessionId
        );
      } catch {
        // Continue with local logout.
      }
    }

    sessionStorage.removeItem(
      "decisionrail-session"
    );

    setSession(null);
    setCases([]);
    setMetrics(null);
    setSelectedCaseId(null);
    setSelectedAudit(null);
  }

  if (!session) {
    return (
      <LoginPage
        onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar
        role={session.user.role}
        screen={screen}
        onNavigate={setScreen}
        onLogout={handleLogout}
      />

      <main className="main">
        <Topbar
          user={session.user}
          loading={loading}
          onRefresh={() => {
            void loadCases();

            if (
              session.user.role === "Admin"
            ) {
              void loadMetrics();
            }
          }}
        />

        <div className="content">
          {error && (
            <div className="error">
              {error}
            </div>
          )}

          {notice && (
            <div className="notice">
              {notice}
            </div>
          )}

          {screen === "overview" && (
            <Overview
              cases={cases}
              metrics={metrics}
              onQueue={() =>
                setScreen("queue")
              }
              onOpenCase={openCase}
            />
          )}

          {screen === "cases" && (
            <CasesScreen
              cases={cases}
              onOpenCase={openCase}
            />
          )}

          {screen === "queue" && (
            <Queue
              cases={cases}
              onOpenCase={openCase}
              onAction={
                executeHumanAction
              }
            />
          )}

          {screen === "decision" && (
            <DecisionExperience
              cases={cases}
              selectedCaseId={
                selectedCaseId
              }
              audit={selectedAudit}
              role={session.user.role}
              onBack={() =>
                setScreen("cases")
              }
              onAction={
                executeHumanAction
              }
            />
          )}

          {screen === "comparison" && (
            <Comparison
              metrics={metrics}
              role={session.user.role}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ==================================================
// LOGIN
// ==================================================

function LoginPage({
  onLogin
}: {
  onLogin: (
    session: Session
  ) => void;
}) {
  const [
    username,
    setUsername
  ] = useState("revops");

  const [
    password,
    setPassword
  ] = useState("revops-demo");

  const [
    loading,
    setLoading
  ] = useState(false);

  const [
    error,
    setError
  ] = useState<string | null>(null);

  async function submit(
    event: React.FormEvent
  ) {
    event.preventDefault();

    try {
      setLoading(true);
      setError(null);

      const response = await login(
        username,
        password
      );

      onLogin({
        sessionId:
          response.sessionId,
        user: response.user
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo">
          <div className="logo-mark">
            D
          </div>

          <div>
            <div className="logo-title">
              DecisionRail
            </div>

            <div className="logo-subtitle">
              AI Revenue Recovery
            </div>
          </div>
        </div>

        <div className="login-heading">
          Recover more.
          <br />
          Decide safely.
        </div>

        <div className="login-copy">
          See what needs attention,
          understand why, and act
          inside the recovery boundary.
        </div>

        <form
          className="card"
          onSubmit={submit}
          style={{
            marginTop: 24
          }}
        >
          <Field
            label="Username"
            value={username}
            onChange={setUsername}
          />

          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
          />

          {error && (
            <div className="error">
              {error}
            </div>
          )}

          <button
            className="button primary"
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              marginTop: 18
            }}
          >
            {loading
              ? "Signing in..."
              : "Open DecisionRail"}
          </button>

          <div
            style={{
              marginTop: 14,
              fontSize: 10,
              color: "#566276"
            }}
          >
            Demo: revops / revops-demo
          </div>
        </form>
      </div>
    </div>
  );
}

// ==================================================
// OVERVIEW
// ==================================================

function Overview({
  cases,
  metrics,
  onQueue,
  onOpenCase
}: {
  cases: EvaluationCase[];
  metrics:
    | ExperimentMetrics
    | null;
  onQueue: () => void;
  onOpenCase: (
    caseId: string
  ) => void;
}) {
  const pending =
    cases.filter(
      x =>
        x.state ===
        "Awaiting Human Approval"
    );

  return (
    <div>
      <PageHeader
        eyebrow="RECOVERY OVERVIEW"
        title="How are we doing?"
        description="Daily command center for recovery performance and the cases that need attention."
        action={
          <button
            className="button primary"
            onClick={onQueue}
          >
            Review approvals
          </button>
        }
      />

      <div className="metrics-grid">
        <MetricCard
          label="DecisionRail recovered"
          value={
            metrics
              ? formatRupees(
                  metrics.decisionRail
                    .recoveredAmount
                )
              : "—"
          }
          detail={
            metrics
              ? `${metrics.decisionRail.recoveryRate.toFixed(1)}% recovery`
              : "Admin metrics"
          }
        />

        <MetricCard
          label="Baseline recovered"
          value={
            metrics
              ? formatRupees(
                  metrics.baseline
                    .recoveredAmount
                )
              : "—"
          }
          detail={
            metrics
              ? `${metrics.baseline.recoveryRate.toFixed(1)}% recovery`
              : "Admin metrics"
          }
        />

        <MetricCard
          label="Awaiting approval"
          value={String(
            pending.length
          )}
          detail="Needs human action"
        />

        <MetricCard
          label="Evaluation cases"
          value={String(
            cases.length
          )}
          detail="Current synthetic batch"
        />
      </div>

      <div className="two-columns">
        <section className="card">
          <SectionTitle
            title="What needs attention?"
            subtitle="Highest-priority cases waiting for a human"
          />

          {pending
            .slice(0, 6)
            .map(item => (
              <button
                className="case-row"
                key={item.caseId}
                onClick={() =>
                  onOpenCase(
                    item.caseId
                  )
                }
              >
                <div>
                  <div className="case-id">
                    {item.caseId}
                  </div>

                  <div className="case-meta">
                    {
                      item.declineCategory
                    }
                    {" · "}
                    {
                      item.timeRemainingDays
                    }{" "}
                    day(s) left
                  </div>
                </div>

                <div className="case-amount">
                  {formatRupees(
                    item.amountAtRisk
                  )}
                </div>
              </button>
            ))}

          {!pending.length && (
            <Empty
              title="Queue is clear"
              description="No cases currently need human attention."
            />
          )}
        </section>

        <section className="card">
          <SectionTitle
            title="Recovery state"
            subtitle="Current position of the batch"
          />

          <StateBar
            label="Awaiting approval"
            value={pending.length}
            total={cases.length}
          />

          <StateBar
            label="Retry scheduled"
            value={
              cases.filter(
                x =>
                  x.state ===
                  "Retry Scheduled"
              ).length
            }
            total={cases.length}
          />

          <StateBar
            label="Stopped"
            value={
              cases.filter(
                x =>
                  x.state === "Stopped"
              ).length
            }
            total={cases.length}
          />
        </section>
      </div>
    </div>
  );
}

// ==================================================
// CASES
// ==================================================

function CasesScreen({
  cases,
  onOpenCase
}: {
  cases: EvaluationCase[];
  onOpenCase: (
    caseId: string
  ) => void;
}) {
  const [query, setQuery] =
    useState("");

  const [filter, setFilter] =
    useState("All");

  const filtered = useMemo(
    () =>
      cases.filter(item => {
        const text =
          `${item.caseId} ${item.declineCategory} ${item.valueTier}`.toLowerCase();

        return (
          text.includes(
            query.toLowerCase()
          ) &&
          (
            filter === "All" ||
            item.state === filter
          )
        );
      }),
    [cases, query, filter]
  );

  return (
    <div>
      <PageHeader
        eyebrow="AT-RISK PAYMENTS"
        title="Everything in flight"
        description="Show me everything in flight. Open a case to understand the recovery decision."
      />

      <div className="filter-bar">
        <input
          className="input"
          placeholder="Search case or decline reason"
          value={query}
          onChange={event =>
            setQuery(
              event.target.value
            )
          }
        />

        <select
          className="select"
          value={filter}
          onChange={event =>
            setFilter(
              event.target.value
            )
          }
        >
          <option>All</option>
          <option>At Risk</option>
          <option>
            Awaiting Human Approval
          </option>
          <option>
            Retry Scheduled
          </option>
          <option>Recovered</option>
          <option>Stopped</option>
        </select>
      </div>

      <section className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Amount</th>
                <th>Decline</th>
                <th>Tier</th>
                <th>Attempt</th>
                <th>State</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(item => (
                <tr
                  key={item.caseId}
                  onClick={() =>
                    onOpenCase(
                      item.caseId
                    )
                  }
                >
                  <td>
                    {item.caseId}
                  </td>

                  <td>
                    {formatRupees(
                      item.amountAtRisk
                    )}
                  </td>

                  <td>
                    {
                      item.declineCategory
                    }
                  </td>

                  <td>
                    {item.valueTier}
                  </td>

                  <td>
                    {item.attemptNumber}
                  </td>

                  <td>
                    <Status
                      state={
                        item.state
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ==================================================
// APPROVAL QUEUE
// ==================================================

function Queue({
  cases,
  onOpenCase,
  onAction
}: {
  cases: EvaluationCase[];

  onOpenCase: (
    caseId: string
  ) => void;

  onAction: (
    caseId: string,
    action:
      | "approve"
      | "override"
      | "stop",
    overrideAction?: ActionType
  ) => void;
}) {
  const pending =
    cases.filter(
      x =>
        x.state ===
        "Awaiting Human Approval"
    );

  return (
    <div>
      <PageHeader
        eyebrow="HUMAN APPROVAL QUEUE"
        title="What do I need to act on?"
        description="Only decisions that crossed a human-review gate appear here."
      />

      <div className="notice">
        {pending.length} case(s) are
        waiting for human action.
      </div>

      {pending.map(item => (
        <div
          className="card"
          key={item.caseId}
          style={{
            marginBottom: 10
          }}
        >
          <div className="case-id">
            {item.caseId}
          </div>

          <div
            className="case-amount"
            style={{
              marginTop: 9
            }}
          >
            {formatRupees(
              item.amountAtRisk
            )}
          </div>

          <div className="case-meta">
            {
              item.declineCategory
            }
            {" · "}
            {item.valueTier}
            {" · "}
            {
              item.timeRemainingDays
            }{" "}
            day(s) remaining
          </div>

          <div className="actions">
            <button
              className="button"
              onClick={() =>
                onOpenCase(
                  item.caseId
                )
              }
            >
              View decision
            </button>

            <button
              className="button primary"
              onClick={() =>
                onAction(
                  item.caseId,
                  "approve"
                )
              }
            >
              Approve
            </button>

            <button
              className="button"
              onClick={() =>
                onAction(
                  item.caseId,
                  "override",
                  "retry_later"
                )
              }
            >
              Override
            </button>

            <button
              className="button danger"
              onClick={() =>
                onAction(
                  item.caseId,
                  "stop"
                )
              }
            >
              Stop
            </button>
          </div>
        </div>
      ))}

      {!pending.length && (
        <section className="card">
          <Empty
            title="Approval queue is clear"
            description="No cases are waiting for a human decision."
          />
        </section>
      )}
    </div>
  );
}

// ==================================================
// DECISION EXPERIENCE
// ==================================================

function DecisionExperience({
  cases,
  selectedCaseId,
  audit,
  role,
  onBack,
  onAction
}: {
  cases: EvaluationCase[];

  selectedCaseId:
    | string
    | null;

  audit:
    | DecisionAuditWithOutcome
    | null;

  role: Role;

  onBack: () => void;

  onAction: (
    caseId: string,
    action:
      | "approve"
      | "override"
      | "stop",
    overrideAction?: ActionType
  ) => void;
}) {
  const item =
    cases.find(
      x =>
        x.caseId ===
        selectedCaseId
    );

  const [
    overrideAction,
    setOverrideAction
  ] =
    useState<ActionType>(
      "retry_later"
    );

  if (!item) {
    return (
      <Empty
        title="No case selected"
        description="Open a case from At-Risk Payments."
      />
    );
  }

  const pending =
    item.state ===
    "Awaiting Human Approval";

  return (
    <div>
      <PageHeader
        eyebrow="DECISION EXPERIENCE"
        title={item.caseId}
        description="Do I trust this decision? Review the recommendation, likelihood, economics, and safety gates."
        back="Back to payments"
        onBack={onBack}
      />

      <div className="detail-grid">
        <section className="card">
          <div className="metric-label">
            Amount at risk
          </div>

          <div className="detail-value">
            {formatRupees(
              item.amountAtRisk
            )}
          </div>

          <div className="case-meta">
            failed charge
          </div>

          <div className="info-grid">
            <Info
              label="Decline"
              value={
                item.declineCategory
              }
            />

            <Info
              label="Type"
              value={
                item.hardSoft
              }
            />

            <Info
              label="Value tier"
              value={
                item.valueTier
              }
            />

            <Info
              label="Attempt"
              value={`${item.attemptNumber}/3`}
            />

            <Info
              label="Time remaining"
              value={`${item.timeRemainingDays} day(s)`}
            />

            <Info
              label="Historical recoverer"
              value={
                item.historicalRecoverer
                  ? "Yes"
                  : "No"
              }
            />
          </div>

          <div
            style={{
              marginTop: 18
            }}
          >
            <SectionTitle
              title="Retry history"
              subtitle="Previous recovery attempts"
            />

            {item.retryHistory?.map(
              entry => (
                <div
                  className="case-row"
                  key={
                    entry.attemptNumber
                  }
                >
                  <span>
                    Attempt{" "}
                    {
                      entry.attemptNumber
                    }
                  </span>

                  <span>
                    {entry.outcome}
                  </span>
                </div>
              )
            )}
          </div>
        </section>

        <section className="card">
          <div className="row-top">
            <SectionTitle
              title="Recommended action"
              subtitle="Current policy decision"
            />

            <Status
              state={
                item.state
              }
            />
          </div>

          {audit ? (
            <>
              <div
                style={{
                  marginTop: 18,
                  fontSize: 25,
                  fontWeight: 800,
                  color: "white"
                }}
              >
                {
                  audit.chosenAction
                }
              </div>

              <div className="info-grid">
                <Info
                  label="Policy"
                  value={
                    audit.policyAuthorized
                      ? "Authorized"
                      : "Blocked"
                  }
                />

                <Info
                  label="Human gate"
                  value={
                    audit.requiresHumanApproval
                      ? "Required"
                      : "Not required"
                  }
                />

                <Info
                  label="Model"
                  value={
                    audit.modelVersion
                  }
                />

                <Info
                  label="Resulting state"
                  value={
                    audit.resultingState ||
                    item.state
                  }
                />
              </div>

              {audit.recoveryOutcome && (
                <div
                  style={{
                    marginTop: 18,
                    padding: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 12
                  }}
                >
                  <SectionTitle
                    title="Recovery outcome"
                    subtitle="Observed Razorpay payment result"
                  />

                  <div className="info-grid">
                    <Info
                      label="Outcome"
                      value={
                        audit.recoveryOutcome
                      }
                    />

                    {typeof audit.recoveredAmount ===
                      "number" && (
                      <Info
                        label="Recovered amount"
                        value={formatRupees(
                          audit.recoveredAmount
                        )}
                      />
                    )}

                    {audit.outcomeEvent && (
                      <Info
                        label="Razorpay event"
                        value={
                          audit.outcomeEvent
                        }
                      />
                    )}

                    {audit.outcomeAt && (
                      <Info
                        label="Observed at"
                        value={new Date(
                          audit.outcomeAt
                        ).toLocaleString("en-IN")}
                      />
                    )}
                  </div>
                </div>
              )}

              <div
                style={{
                  marginTop: 22
                }}
              >
                <SectionTitle
                  title="Recovery likelihood"
                  subtitle="Estimated recovery probability by action"
                />

                {Object.entries(
                  audit.likelihoods ||
                    {}
                ).map(
                  ([
                    action,
                    result
                  ]) => (
                    <div
                      className="likelihood-row"
                      key={
                        action
                      }
                    >
                      <div className="row-top">
                        <span className="row-name">
                          {
                            action
                          }
                        </span>

                        <span className="row-value">
                          {(
                            result.probability *
                            100
                          ).toFixed(
                            1
                          )}
                          %
                        </span>
                      </div>

                      <div className="progress">
                        <div
                          className="progress-inner"
                          style={{
                            width:
                              `${Math.min(
                                100,
                                Math.max(
                                  0,
                                  result.probability *
                                    100
                                )
                              )}%`
                          }}
                        />
                      </div>
                    </div>
                  )
                )}
              </div>

              <div
                style={{
                  marginTop: 22
                }}
              >
                <SectionTitle
                  title="Expected value"
                  subtitle="Economic value of each action"
                />

                {Object.entries(
                  audit.evResults ||
                    {}
                ).map(
                  ([
                    action,
                    value
                  ]) => (
                    <div
                      className="ev-row"
                      key={
                        action
                      }
                    >
                      <div className="row-top">
                        <span className="row-name">
                          {
                            action
                          }
                        </span>

                        <span className="row-value">
                          {
                            formatRupees(
                              Number(
                                value
                              )
                            )
                          }
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>

              <div
                style={{
                  marginTop: 22
                }}
              >
                <SectionTitle
                  title="Safety gates"
                  subtitle="Policy constraints applied before execution"
                />

                {Object.entries(
                  audit.policyChecks ||
                    {}
                ).map(
                  ([
                    key,
                    value
                  ]) => (
                    <div
                      className="policy-row"
                      key={key}
                    >
                      <div className="row-top">
                        <span className="row-name">
                          {key}
                        </span>

                        <span className="row-value">
                          {
                            formatValue(
                              value
                            )
                          }
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </>
          ) : (
            <div
              className="notice"
              style={{
                marginTop: 20
              }}
            >
              {role === "RevOps"
                ? "Operational details are available. Raw decision audit calculations are restricted to Admin."
                : "Decision audit is unavailable."}
            </div>
          )}

          {pending && (
            <div
              style={{
                marginTop: 22
              }}
            >
              <SectionTitle
                title="Human decision"
                subtitle="Approve, override, or stop recovery"
              />

              <div className="actions">
                <button
                  className="button primary"
                  onClick={() =>
                    onAction(
                      item.caseId,
                      "approve"
                    )
                  }
                >
                  Approve
                </button>

                <select
                  className="select"
                  value={
                    overrideAction
                  }
                  onChange={event =>
                    setOverrideAction(
                      event.target
                        .value as ActionType
                    )
                  }
                >
                  <option value="retry_now">
                    Retry now
                  </option>

                  <option value="retry_later">
                    Retry later
                  </option>

                  <option value="notify_only">
                    Notify only
                  </option>

                  <option value="escalate">
                    Escalate
                  </option>

                  <option value="stop">
                    Stop
                  </option>
                </select>

                <button
                  className="button"
                  onClick={() =>
                    onAction(
                      item.caseId,
                      "override",
                      overrideAction
                    )
                  }
                >
                  Override
                </button>

                <button
                  className="button danger"
                  onClick={() =>
                    onAction(
                      item.caseId,
                      "stop"
                    )
                  }
                >
                  Stop
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ==================================================
// COMPARISON
// ==================================================

function Comparison({
  metrics,
  role
}: {
  metrics:
    | ExperimentMetrics
    | null;
  role: Role;
}) {
  if (role !== "Admin") {
    return (
      <div>
        <PageHeader
          eyebrow="BASELINE COMPARISON"
          title="Is DecisionRail actually better?"
          description="Experiment results are restricted to Admin."
        />

        <section className="card">
          <Empty
            title="Admin access required"
            description="RevOps handles recovery operations. Admin can inspect the controlled experiment."
          />
        </section>
      </div>
    );
  }

  if (!metrics) {
    return (
      <Empty
        title="Metrics unavailable"
        description="Refresh the page and try again."
      />
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="BASELINE COMPARISON"
        title="Is DecisionRail actually better?"
        description="Paired comparison against the fixed baseline on the identical seeded evaluation batch."
      />

      <div className="notice">
        <strong>
          Synthetic / test-mode:
        </strong>{" "}
        these results come from a seeded
        simulated world and are not a
        real-world Razorpay performance
        benchmark.
      </div>

      <div className="metrics-grid">
        <MetricCard
          label="DecisionRail recovered"
          value={formatRupees(
            metrics.decisionRail
              .recoveredAmount
          )}
          detail={`${metrics.decisionRail.recoveryRate.toFixed(1)}% recovery`}
        />

        <MetricCard
          label="Baseline recovered"
          value={formatRupees(
            metrics.baseline
              .recoveredAmount
          )}
          detail={`${metrics.baseline.recoveryRate.toFixed(1)}% recovery`}
        />

        <MetricCard
          label="Incremental recovered"
          value={formatRupees(
            metrics.incrementalRecoveredAmount
          )}
          detail={`+${metrics.recoveryRateImprovementPercentagePoints.toFixed(1)} percentage points`}
        />

        <MetricCard
          label="Wasted retries avoided"
          value={String(
            metrics.wastedRetriesAvoided
          )}
          detail="Compared with baseline"
        />
      </div>

      <div className="two-columns">
        <section className="card">
          <SectionTitle
            title="Experiment integrity"
            subtitle="Controls that make the comparison trustworthy"
          />

          <Integrity
            label="200-case batch"
            value={
              metrics.batchSize === 200
            }
          />

          <Integrity
            label="Same batch"
            value={
              metrics.sameBatchVerified
            }
          />

          <Integrity
            label="Same hidden outcomes"
            value={
              metrics.sameHiddenOutcomesVerified
            }
          />

          <Integrity
            label="Synthetic/test-mode"
            value={
              metrics.syntheticTestMode
            }
          />
        </section>

        <section className="card">
          <SectionTitle
            title="Guardrails"
            subtitle="Secondary experiment metrics"
          />

          <MetricLine
            label="High-value accounts saved"
            value={String(
              metrics.highValueAccountsSaved
            )}
          />

          <MetricLine
            label="Unnecessary write-off"
            value={`${metrics.unnecessaryWriteOffRate.toFixed(1)}%`}
          />

          <MetricLine
            label="False escalation"
            value={
              metrics.falseEscalationRateAvailable &&
              metrics.falseEscalationRate !==
                null
                ? `${metrics.falseEscalationRate.toFixed(1)}%`
                : "Insufficient data"
            }
          />
        </section>
      </div>
    </div>
  );
}

// ==================================================
// SHARED
// ==================================================

function Topbar({
  user,
  loading,
  onRefresh
}: {
  user: User;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">
          Revenue recovery workspace
        </div>

        <div className="topbar-mode">
          Synthetic / Test Mode
        </div>
      </div>

      <div>
        <button
          className="refresh-button"
          onClick={onRefresh}
        >
          {loading
            ? "Loading..."
            : "Refresh"}
        </button>

        <span
          style={{
            marginLeft: 10,
            fontSize: 11,
            color: "#6f7e93"
          }}
        >
          {user.role}
        </span>
      </div>
    </header>
  );
}

function Sidebar({
  role,
  screen,
  onNavigate,
  onLogout
}: {
  role: Role;
  screen: Screen;
  onNavigate: (
    screen: Screen
  ) => void;
  onLogout: () => void;
}) {
  const items: Array<{
    id: Screen;
    label: string;
  }> = [
    {
      id: "overview",
      label: "Recovery Overview"
    },
    {
      id: "cases",
      label: "At-Risk Payments"
    },
    {
      id: "queue",
      label: "Approval Queue"
    },
    {
      id: "decision",
      label: "Decision Experience"
    },
    {
      id: "comparison",
      label: "Baseline Comparison"
    }
  ];

  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-mark">
          D
        </div>

        <div>
          <div className="logo-title">
            DecisionRail
          </div>

          <div className="logo-subtitle">
            Revenue Recovery
          </div>
        </div>
      </div>

      {items.map(item => (
        <button
          key={item.id}
          className={`nav-button ${
            screen === item.id
              ? "active"
              : ""
          }`}
          onClick={() =>
            onNavigate(item.id)
          }
        >
          {item.label}
        </button>
      ))}

      <div className="user-box">
        <div className="user-role">
          Signed in
        </div>

        <div className="user-name">
          {role}
        </div>

        <button
          className="signout"
          onClick={onLogout}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
  back,
  onBack
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  back?: string;
  onBack?: () => void;
}) {
  return (
    <div className="page-header">
      <div>
        {back && onBack && (
          <button
            onClick={onBack}
            style={{
              border: 0,
              background:
                "transparent",
              color: "#5f6d81",
              fontSize: 11,
              padding: 0,
              marginBottom: 13
            }}
          >
            ← {back}
          </button>
        )}

        <div className="page-eyebrow">
          {eyebrow}
        </div>

        <h1 className="page-title">
          {title}
        </h1>

        <div className="page-description">
          {description}
        </div>
      </div>

      {action}
    </div>
  );
}

function SectionTitle({
  title,
  subtitle
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <div className="section-title">
        {title}
      </div>

      <div className="section-subtitle">
        {subtitle}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="card">
      <div className="metric-label">
        {label}
      </div>

      <div className="metric-value">
        {value}
      </div>

      <div className="metric-detail">
        {detail}
      </div>
    </div>
  );
}

function StateBar({
  label,
  value,
  total
}: {
  label: string;
  value: number;
  total: number;
}) {
  const width =
    total === 0
      ? 0
      : (value / total) * 100;

  return (
    <div
      style={{
        marginTop: 18
      }}
    >
      <div className="row-top">
        <span className="row-name">
          {label}
        </span>

        <span className="row-value">
          {value}
        </span>
      </div>

      <div className="progress">
        <div
          className="progress-inner"
          style={{
            width: `${width}%`
          }}
        />
      </div>
    </div>
  );
}

function Status({
  state
}: {
  state: string;
}) {
  const className =
    state ===
    "Awaiting Human Approval"
      ? "status pending"
      : state === "Recovered"
        ? "status success"
        : state === "Stopped"
          ? "status danger"
          : "status";

  return (
    <span
      className={className}
    >
      {state}
    </span>
  );
}

function Info({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="info">
      <div className="info-label">
        {label}
      </div>

      <div className="info-value">
        {value}
      </div>
    </div>
  );
}

function MetricLine({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="info"
      style={{
        display: "flex",
        justifyContent:
          "space-between",
        alignItems: "center",
        marginTop: 8
      }}
    >
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

function Integrity({
  label,
  value
}: {
  label: string;
  value: boolean;
}) {
  return (
    <div
      className="info"
      style={{
        display: "flex",
        justifyContent:
          "space-between",
        alignItems: "center",
        marginTop: 8
      }}
    >
      <span>
        {label}
      </span>

      <strong
        style={{
          color: value
            ? "#79dcb8"
            : "#ed939d"
        }}
      >
        {value ? "✓" : "✕"}
      </strong>
    </div>
  );
}

function Empty({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        padding: 35,
        textAlign: "center"
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "white"
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: 7,
          fontSize: 11,
          color: "#5f6d81"
        }}
      >
        {description}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  type?: string;
}) {
  return (
    <div className="field">
      <label>
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={event =>
          onChange(
            event.target.value
          )
        }
      />
    </div>
  );
}

function formatValue(
  value: unknown
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  if (
    typeof value === "object"
  ) {
    try {
      return JSON.stringify(
        value
      );
    } catch {
      return "[object]";
    }
  }

  return String(value);
}

function errorMessage(
  error: unknown
): string {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return "Something went wrong.";
}