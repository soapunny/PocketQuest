// apps/mobile/src/app/lib/api/plans.ts
// PocketQuest server: /api/plans/monthly
// NOTE: Server currently does NOT enforce Authorization (dev mode). We still structure calls cleanly.

import { API_BASE_URL } from "./baseUrl";

export type PeriodType = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

export type ServerBudgetGoal = {
  category: string;
  limitMinor: number; // cents
};

export type ServerSavingsGoal = {
  name: string;
  targetMinor: number; // cents
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

type Json = Record<string, any>;

async function readJsonSafe(res: Response): Promise<Json> {
  try {
    return (await res.json()) as Json;
  } catch {
    return {};
  }
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
    const msg =
      typeof json?.error === "string"
        ? json.error
        : typeof json?.message === "string"
        ? json.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return json as T;
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: body.userId, at: body.at }),
  });
}

/**
 * PATCH update the month plan's limits/goals.
 * This replaces budgetGoals/savingsGoals sets when provided.
 */

export async function patchMonthlyPlan(
  body: PatchMonthlyPlanBody & { baseUrl?: string }
) {
  const { baseUrl, ...payload } = body;
  const url = withQuery(baseUrl, "/api/plans/monthly", { at: payload.at });

  return request<{ plan: ServerPlan; debug?: any }>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
