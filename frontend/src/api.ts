import type {
  ActionType,
  ApprovalResponse,
  AuditResponse,
  CaseDetailResponse,
  CasesResponse,
  DecisionAudit,
  ExperimentMetrics,
  LoginResponse
} from "./types";

const API_URL =
  import.meta.env.VITE_API_URL || "";

async function request<T>(
  path: string,
  options: RequestInit = {},
  sessionId?: string
): Promise<T> {
  const headers =
    new Headers(options.headers);

  if (
    options.body &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json"
    );
  }

  if (sessionId) {
    headers.set(
      "Authorization",
      `Bearer ${sessionId}`
    );
  }

  const response =
    await fetch(
      `${API_URL}${path}`,
      {
        ...options,
        headers
      }
    );

  const text =
    await response.text();

  let data: unknown = null;

  if (text) {
    try {
      data =
        JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data
    ) {
      throw new Error(
        String(
          (
            data as {
              error: unknown;
            }
          ).error
        )
      );
    }

    throw new Error(
      `Request failed with HTTP ${response.status}`
    );
  }

  return data as T;
}

export function login(
  username: string,
  password: string
): Promise<LoginResponse> {
  return request<LoginResponse>(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        username,
        password
      })
    }
  );
}

export function logout(
  sessionId: string
): Promise<void> {
  return request<void>(
    "/api/auth/logout",
    {
      method: "POST"
    },
    sessionId
  );
}

export function getCases(
  sessionId: string
): Promise<CasesResponse> {
  return request<CasesResponse>(
    "/cases",
    {},
    sessionId
  );
}

export function getCase(
  sessionId: string,
  caseId: string
): Promise<CaseDetailResponse> {
  return request<CaseDetailResponse>(
    `/cases/${encodeURIComponent(caseId)}`,
    {},
    sessionId
  );
}

export function getDecisionExplanation(
  sessionId: string,
  caseId: string
): Promise<{
  explanation: DecisionAudit;
}> {
  return request<{
    explanation: DecisionAudit;
  }>(
    `/cases/${encodeURIComponent(caseId)}/decision`,
    {},
    sessionId
  );
}

export function getAudit(
  sessionId: string,
  decisionId: string
): Promise<AuditResponse> {
  return request<AuditResponse>(
    `/audit/${encodeURIComponent(decisionId)}`,
    {},
    sessionId
  );
}

export function approveCase(
  sessionId: string,
  caseId: string,
  decisionId: string
): Promise<ApprovalResponse> {
  return request<ApprovalResponse>(
    `/cases/${encodeURIComponent(caseId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({
        decisionId
      })
    },
    sessionId
  );
}

export function overrideCase(
  sessionId: string,
  caseId: string,
  decisionId: string,
  overrideAction: ActionType
): Promise<ApprovalResponse> {
  return request<ApprovalResponse>(
    `/cases/${encodeURIComponent(caseId)}/override`,
    {
      method: "POST",
      body: JSON.stringify({
        decisionId,
        overrideAction
      })
    },
    sessionId
  );
}

export function stopCase(
  sessionId: string,
  caseId: string,
  decisionId: string
): Promise<ApprovalResponse> {
  return request<ApprovalResponse>(
    `/cases/${encodeURIComponent(caseId)}/stop`,
    {
      method: "POST",
      body: JSON.stringify({
        decisionId
      })
    },
    sessionId
  );
}

export async function getExperimentMetrics(
  sessionId: string
): Promise<ExperimentMetrics> {
  const response =
    await request<{
      runId: string;
      metrics: ExperimentMetrics;
    }>(
      "/experiments/day5-current/metrics",
      {},
      sessionId
    );

  return response.metrics;
}

export function formatRupees(
  amount: number
): string {
  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }
  ).format(amount);
}