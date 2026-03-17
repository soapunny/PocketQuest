// apps/server/src/domain/plan/plan.mapper.ts
// Single source of truth for Prisma Plan → ServerPlanDTO conversion.
// Pure, side-effect free. No business validation.

import { serverPlanDTOSchema } from "@pq/shared/plans/types";
import type { ServerPlanDTO } from "@pq/shared/plans/types";

function toFiniteNumberOrNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/[,\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  try {
    const s = String((v as { toString?: () => string })?.toString?.() ?? "")
      .trim()
      .replace(/[,\s]/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function normalizeCategory(v: unknown): string {
  const s = String(v ?? "other").trim().toLowerCase();
  return s || "other";
}

function normalizeName(v: unknown): string {
  const s = String(v ?? "Other").trim();
  return s || "Other";
}

/**
 * Converts a Prisma plan (with budgetGoals and savingsGoals included) to ServerPlanDTO.
 * Preserves compatibility fields: currency, homeCurrency, displayCurrency, language.
 *
 * @param plan - Prisma plan with budgetGoals and savingsGoals relations
 * @param fallbackTimeZone - Used when plan.timeZone is missing/invalid
 */
export function toServerPlanDTO(
  plan: {
    id?: unknown;
    periodType?: unknown;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    periodAnchor?: Date | null;
    timeZone?: unknown;
    totalBudgetLimitMinor?: unknown;
    currency?: unknown;
    language?: unknown;
    budgetGoals?: Array<{ id?: unknown; category?: unknown; limitMinor?: unknown }>;
    savingsGoals?: Array<{ id?: unknown; name?: unknown; targetMinor?: unknown }>;
  },
  fallbackTimeZone: string,
): ServerPlanDTO {
  const timeZone =
    typeof plan?.timeZone === "string" && plan.timeZone.trim()
      ? plan.timeZone.trim()
      : fallbackTimeZone;

  const dto: ServerPlanDTO = {
    id: plan?.id != null ? String(plan.id) : undefined,
    language: (plan?.language as ServerPlanDTO["language"]) ?? null,
    periodType: plan?.periodType as ServerPlanDTO["periodType"],
    periodStartUTC:
      plan?.periodStart instanceof Date
        ? plan.periodStart.toISOString()
        : undefined,
    periodEndUTC:
      plan?.periodEnd instanceof Date ? plan.periodEnd.toISOString() : undefined,
    periodAnchorUTC:
      plan?.periodAnchor instanceof Date
        ? plan.periodAnchor.toISOString()
        : undefined,
    timeZone,
    totalBudgetLimitMinor: toFiniteNumberOrNull(plan?.totalBudgetLimitMinor),
    currency: plan?.currency as ServerPlanDTO["currency"],
    homeCurrency: plan?.currency as ServerPlanDTO["homeCurrency"],
    displayCurrency: plan?.currency as ServerPlanDTO["displayCurrency"],
    budgetGoals: Array.isArray(plan?.budgetGoals)
      ? plan.budgetGoals.map((g) => ({
          id: g.id != null ? String(g.id) : null,
          category: normalizeCategory(g.category),
          limitMinor: toFiniteNumberOrNull(g.limitMinor),
        }))
      : null,
    savingsGoals: Array.isArray(plan?.savingsGoals)
      ? plan.savingsGoals.map((g) => ({
          id: g.id != null ? String(g.id) : null,
          name: normalizeName(g.name),
          targetMinor: toFiniteNumberOrNull(g.targetMinor),
        }))
      : null,
  };

  return serverPlanDTOSchema.parse(dto) as ServerPlanDTO;
}
