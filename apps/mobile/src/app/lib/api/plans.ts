// apps/mobile/src/app/lib/api/plans.ts
// PocketQuest server: /api/plans and /api/plans/monthly
// NOTE: In dev, server auth is bypassed via `x-dev-user-id` header.

import { API_BASE_URL } from "./baseUrl";

export type PeriodType = "WEEKLY" | "BIWEEKLY" | "MONTHLY";
export type PlanPeriodType = PeriodType;

export type ServerBudgetGoal = {
  category: string;
  limitMinor: number; // minor units
};

export type ServerSavingsGoal = {
  name: string;
  targetMinor: number; // minor units
};

export type ServerPlan = {
  id: string;
  userId: string;
  periodType: PeriodType;
  // Prisma DateTime will serialize to ISO string in JSON
  periodStart: string; // ISO
  currency: string;
  language: string;
  totalBudgetLimitMinor: number;
  budgetGoals: ServerBudgetGoal[];
  savingsGoals: ServerSavingsGoal[];
  createdAt?: string;
  updatedAt?: string;
};

export type PlanGetResponse = {
  plan: ServerPlan;
  debug?: any;
};

export type PlanListItem = {
  periodStartUTC: string;
  plan: ServerPlan | null;
};

export type PlanListResponse = {
  periodType: "MONTHLY";
  timeZone: string;
  months: number;
  anchorPeriodStartUTC: string;
  items: PlanListItem[];
  debug?: any;
};

export type PatchMonthlyPlanBody = {
  // DEV ONLY: userId is passed explicitly.
  userId: string;
  at?: string; // YYYY-MM or ISO
  totalBudgetLimitMinor?: number;
  budgetGoals?: ServerBudgetGoal[];
  savingsGoals?: ServerSavingsGoal[];
};

export type UpsertPlanBody = {
  userId: string;
  periodType: PlanPeriodType;
  periodStartUTC: string; // ISO
};

export type PatchPlanBody = {
  userId: string;
  periodType: PlanPeriodType;
  periodStartUTC: string; // ISO
  totalBudgetLimitMinor?: number;
  budgetGoals?: ServerBudgetGoal[];
  savingsGoals?: ServerSavingsGoal[];
};

type Json = Record<string, any>;

function buildDevHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID;

  if (typeof __DEV__ !== "undefined" && __DEV__ && DEV_USER_ID) {
    headers["x-dev-user-id"] = DEV_USER_ID;
  }

  return headers;
}

async function readJsonSafe(res: Response): Promise<Json> {
  try {
    return (await res.json()) as Json;
  } catch {
    return {};
  }
}

function isEmptyJsonObject(v: unknown): boolean {
  return (
    v != null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v as Record<string, unknown>).length === 0
  );
}

function looksLikePlan(obj: any): boolean {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.id === "string" &&
    typeof obj.userId === "string" &&
    typeof obj.periodType === "string"
  );
}

function normalizePlanGetResponse(json: any): PlanGetResponse {
  if (json && typeof json === "object") {
    if (looksLikePlan(json.plan)) {
      return json as PlanGetResponse;
    }
    if (looksLikePlan(json)) {
      return { plan: json as ServerPlan };
    }
  }
  return { plan: json as ServerPlan };
}

function normalizePlanPatchResponse(json: any): { plan: ServerPlan; debug?: any } {
  if (json && typeof json === "object") {
    if (looksLikePlan(json.plan)) {
      return json as { plan: ServerPlan; debug?: any };
    }
    if (looksLikePlan(json)) {
      return { plan: json as ServerPlan };
    }
  }
  return { plan: json as ServerPlan };
}

function withQuery(
  baseUrl: string | undefined,
  path: string,
  params: Record<string, string | undefined>
) {
  const resolvedBaseUrl =
    baseUrl && baseUrl.trim().length > 0 ? baseUrl : API_BASE_URL;
  const url = new URL(path, resolvedBaseUrl);
  Object.entries(params).forEach(([k, v]) => {
    if (v && v.trim().length > 0) url.searchParams.set(k, v);
  });
  return url.toString();
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const json = await readJsonSafe(res);

  if (!res.ok) {
    const baseMsgRaw =
      typeof json?.error === "string"
        ? json.error
        : typeof json?.message === "string"
        ? json.message
        : res.statusText
        ? res.statusText
        : `Request failed (${res.status})`;

    const baseMsg = `(${res.status}) ${baseMsgRaw}`;

    const details =
      typeof json?.details === "string" ? `\nDetails: ${json.details}` : "";

    // Keep debug small and safe for Alerts
    let debug = "";
    if (json?.debug != null) {
      try {
        const s = JSON.stringify(json.debug);
        debug = s.length > 500 ? `\nDebug: ${s.slice(0, 500)}…` : `\nDebug: ${s}`;
      } catch {
        debug = "";
      }
    }

    throw new Error(`${baseMsg}${details}${debug}`);
  }

  return json as T;
}

/**
 * Period-aware: POST create-or-get a plan for a given period.
 * Server should upsert by (userId, periodType, periodStartUTC) or equivalent.
 */
export async function upsertPlan(body: UpsertPlanBody & { baseUrl?: string }) {
  const { baseUrl, ...payload } = body;
  const url = withQuery(baseUrl, "/api/plans", {});

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...buildDevHeaders() },
    body: JSON.stringify(payload),
  });

  const json = await readJsonSafe(res);

  if (!res.ok) {
    // Reuse request() error formatting
    return request<PlanGetResponse>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildDevHeaders() },
      body: JSON.stringify(payload),
    });
  }

  const raw = (json || {}) as any;
  const out = normalizePlanGetResponse(raw);

  if (!out.plan || !out.plan.id) {
    const hint = isEmptyJsonObject(raw)
      ? " (empty response body)"
      : ` (keys: ${Object.keys(raw).join(", ")})`;
    throw new Error(
      `[plansApi] POST /api/plans succeeded but did not return a valid plan${hint}`
    );
  }

  return out;
}

/**
 * Period-aware: PATCH update a plan for a given period.
 * This replaces budgetGoals/savingsGoals sets when provided.
 */
export async function patchPlan(body: PatchPlanBody & { baseUrl?: string }) {
  const { baseUrl, ...payload } = body;
  const url = withQuery(baseUrl, "/api/plans", {});

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...buildDevHeaders() },
    body: JSON.stringify(payload),
  });

  const json = await readJsonSafe(res);

  if (!res.ok) {
    // Reuse request() error formatting
    return request<{ plan: ServerPlan; debug?: any }>(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...buildDevHeaders() },
      body: JSON.stringify(payload),
    });
  }

  const raw = (json || {}) as any;
  const out = normalizePlanPatchResponse(raw);

  // Some implementations return empty body with 200. If so, refetch by upsert.
  if (!out.plan || !out.plan.id) {
    const fetched = await upsertPlan({
      userId: payload.userId,
      periodType: payload.periodType,
      periodStartUTC: payload.periodStartUTC,
      baseUrl,
    });

    return {
      plan: fetched.plan,
      debug: {
        ...(out.debug ?? {}),
        clientFallback:
          "patchPlan->upsertPlan (missing/invalid plan in PATCH response)",
      },
    };
  }

  return out;
}

/**
 * GET a single MONTHLY plan for a month (no create). 404 if missing.
 * - userId: required (dev)
 * - at: optional (YYYY-MM or ISO)
 */
export async function getMonthlyPlan(args: {
  userId: string;
  at?: string;
  baseUrl?: string;
}) {
  const url = withQuery(args.baseUrl, "/api/plans/monthly", {
    userId: args.userId,
    at: args.at,
  });
  return request<PlanGetResponse>(url, { method: "GET" });
}

/**
 * GET recent N months (newest-first). Missing months return plan: null.
 */
export async function listMonthlyPlans(args: {
  userId: string;
  months: number;
  at?: string;
  baseUrl?: string;
}) {
  const url = withQuery(args.baseUrl, "/api/plans/monthly", {
    userId: args.userId,
    months: String(args.months),
    at: args.at,
  });
  return request<PlanListResponse>(url, { method: "GET" });
}

/**
 * POST create-or-get the current month MONTHLY plan.
 * Server upserts by (userId, periodType, periodStart).
 */
export async function upsertMonthlyPlan(body: {
  userId: string;
  at?: string;
  baseUrl?: string;
}) {
  const url = withQuery(body.baseUrl, "/api/plans/monthly", { at: body.at });
  return request<PlanGetResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...buildDevHeaders() },
    body: JSON.stringify({ userId: body.userId }),
  });
}

/**
 * PATCH update the month plan's limits/goals.
 * This replaces budgetGoals/savingsGoals sets when provided.
 */
export async function patchMonthlyPlan(
  body: PatchMonthlyPlanBody & { baseUrl?: string }
) {
  const { baseUrl, at, ...payload } = body;
  const url = withQuery(baseUrl, "/api/plans/monthly", { at });

  return request<{ plan: ServerPlan; debug?: any }>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...buildDevHeaders() },
    body: JSON.stringify(payload),
  });
}
