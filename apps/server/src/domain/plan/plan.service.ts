// apps/server/src/domain/plan/plan.service.ts
// Business rules and orchestration. No Prisma direct access.

import {
  CurrencyCode,
  LanguageCode,
  PeriodType as PrismaPeriodType,
} from "@prisma/client";
import type {
  GoalsMode,
  PatchBudgetGoalsRequestDTO,
  PatchPlanDTO,
  PatchSavingsGoalsRequestDTO,
  ServerPlanDTO,
  SwitchCurrencyRequestDTO,
  SwitchMode,
  UpsertBudgetGoalRequestDTO,
  UpsertSavingsGoalRequestDTO,
} from "@pq/shared/plans/types";
import type { MonthlyPlansListResponseDTO } from "@pq/shared/plans/types";

import { HttpError } from "@/lib/http/httpError";
import { normalizeTimeZone } from "@/lib/plan/periodUtils";
import {
  buildPeriodStartListUTC,
  calcNextPeriodEnd,
  getBiweeklyPeriodStartUTC,
  getMonthlyPeriodStartUTC,
  getMonthlyPeriodStartUTCForAt,
  getWeeklyPeriodStartUTC,
  isoLocalDayToUTCDate,
  parseMonthlyAtOrNull,
} from "@/lib/plan/periodRules";
import { ensureDefaultActivePlan } from "@/lib/plan/planCreateFactory";
import { DEFAULT_WEEK_STARTS_ON } from "@/lib/plan/defaults";
import { ensurePeriodEnd } from "@/lib/plan/periodRules";
import { buildPeriodForNowUTC } from "@/lib/plan/periodFactory";
import { convertPlanMinorPayload } from "@/lib/plan/goalsPolicy";

import * as authRepo from "@/domain/auth/auth.repository";
import * as planRepo from "./plan.repository";
import { toServerPlanDTO } from "./plan.mapper";

const MAX_SAVINGS_GOALS_PER_PLAN = 10;

function parseIsoDateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Ensures user has an active plan (creates one if missing).
 * Used by auth flow on sign-in. Delegates to repository which uses
 * proper period rules (MONTHLY default via @/lib/plan/activePlan).
 */
export async function ensureActivePlan(userId: string) {
  await planRepo.ensureActivePlanWithGoals(userId);
  const user = await authRepo.findUserById(userId);
  if (!user) throw new Error("User not found");
  return user;
}

/**
 * Get current plan: active plan, or fallback to latest, or auto-create default.
 * Restores activePlanId when fallback is used.
 */
export async function getCurrentPlan(userId: string): Promise<ServerPlanDTO> {
  const user = await planRepo.findUserForPlanPrefs(userId);
  if (!user) throw new HttpError(404, "User not found");

  const timeZone = normalizeTimeZone(user.timeZone);

  if (user.activePlanId) {
    const activePlan = await planRepo.findPlanByIdWithGoals(user.activePlanId);
    if (activePlan) {
      return toServerPlanDTO(activePlan, timeZone);
    }
  }

  const latestPlan = await planRepo.findLatestPlanWithGoals(userId);
  if (!latestPlan) {
    const created = await ensureDefaultActivePlan(userId, timeZone);
    return toServerPlanDTO(created, timeZone);
  }

  await planRepo.setUserActivePlanId(userId, latestPlan.id);
  return toServerPlanDTO(latestPlan, timeZone);
}

/**
 * Get plan by exact periodType + periodStartISO.
 * Returns null if not found.
 */
export async function getPlanByPeriod(
  userId: string,
  periodType: PrismaPeriodType,
  periodStartISO: string,
): Promise<ServerPlanDTO | null> {
  const user = await planRepo.findUserForPlanPrefs(userId);
  if (!user) throw new HttpError(404, "User not found");

  const timeZone = normalizeTimeZone(user.timeZone);
  const periodStart = isoLocalDayToUTCDate(timeZone, periodStartISO);

  const plan = await planRepo.findPlanByUniqueKey(
    userId,
    periodType,
    periodStart,
  );
  if (!plan) return null;

  return toServerPlanDTO(plan, timeZone);
}

/**
 * Get monthly plans list for dashboard/analytics.
 */
export async function getMonthlyPlans(
  userId: string,
  at?: string | null,
  months?: string | null,
): Promise<MonthlyPlansListResponseDTO> {
  const user = await planRepo.findUserForPlanPrefs(userId);
  if (!user) throw new HttpError(404, "User not found");

  const timeZone = normalizeTimeZone(user.timeZone);
  const countRaw = typeof months === "string" ? Number(months) : NaN;
  const count = Number.isFinite(countRaw)
    ? Math.min(120, Math.max(1, Math.trunc(countRaw)))
    : 1;

  const now = new Date();
  const startsUTC = buildPeriodStartListUTC({
    periodType: PrismaPeriodType.MONTHLY,
    timeZone,
    startUTC: getMonthlyPeriodStartUTC(timeZone, now),
    count,
    at,
    now,
  });

  const plans = await planRepo.findPlansByStarts(
    userId,
    PrismaPeriodType.MONTHLY,
    startsUTC,
  );

  const byStart = new Map<number, (typeof plans)[0]>();
  for (const p of plans) {
    if (p?.periodStart instanceof Date) {
      byStart.set(p.periodStart.getTime(), p);
    }
  }

  const items = startsUTC
    .slice()
    .sort((a, b) => b.getTime() - a.getTime())
    .map((start) => {
      const plan = byStart.get(start.getTime()) ?? null;
      return {
        periodStartUTC: start.toISOString(),
        plan: plan ? toServerPlanDTO(plan, timeZone) : null,
      };
    });

  return {
    timeZone,
    periodType: "MONTHLY",
    at: typeof at === "string" ? at : null,
    months: typeof months === "string" ? months : null,
    items,
  };
}

/**
 * Create or update plan. Used by both POST and PATCH.
 * For POST, caller may pass monthlyAtOverride (e.g. from url.searchParams.get("at")).
 */
export async function upsertPlan(
  userId: string,
  data: PatchPlanDTO,
  options?: { monthlyAtOverride?: string; allowMonthlyAtFromQuery?: boolean },
): Promise<ServerPlanDTO> {
  const user = await planRepo.findUserForPlanPrefs(userId);
  if (!user) throw new HttpError(404, "User not found");

  const timeZone = normalizeTimeZone(user.timeZone);
  const planTimeZone = timeZone;

  const monthlyAt =
    data.periodType === "MONTHLY"
      ? (data.at ?? options?.monthlyAtOverride ?? undefined)
      : undefined;

  const setActive = data.setActive === true;
  const useCurrentPeriod = data.useCurrentPeriod === true;

  if (
    data.periodType === "BIWEEKLY" &&
    !data.periodAnchorISO &&
    !data.periodAnchorUTC
  ) {
    throw new HttpError(
      400,
      "periodAnchorISO or periodAnchorUTC is required for biweekly plans",
    );
  }

  const allowMonthlyAt = options?.allowMonthlyAtFromQuery === true;
  if (
    data.periodType !== "WEEKLY" &&
    !data.periodStartISO &&
    !data.periodStartUTC &&
    !(setActive && useCurrentPeriod) &&
    !(data.periodType === "MONTHLY" && monthlyAt)
  ) {
    throw new HttpError(
      400,
      allowMonthlyAt
        ? "periodStartISO or periodStartUTC is required for non-weekly plans (or provide at=YYYY-MM for monthly)"
        : "periodStartISO or periodStartUTC is required for non-weekly plans",
    );
  }

  let periodStart: Date;

  if (data.periodType === "WEEKLY") {
    periodStart = getWeeklyPeriodStartUTC(
      timeZone,
      new Date(),
      DEFAULT_WEEK_STARTS_ON,
    );
  } else if (setActive && useCurrentPeriod) {
    if (data.periodType === "MONTHLY") {
      periodStart = getMonthlyPeriodStartUTC(timeZone, new Date());
    } else {
      const parsedAnchorUTC = parseIsoDateOrNull(data.periodAnchorUTC);
      const anchorUTC = parsedAnchorUTC
        ? parsedAnchorUTC
        : isoLocalDayToUTCDate(timeZone, data.periodAnchorISO!);
      periodStart = getBiweeklyPeriodStartUTC(
        timeZone,
        anchorUTC,
        new Date(),
        DEFAULT_WEEK_STARTS_ON,
      );
    }
  } else {
    const parsedStartUTC = parseIsoDateOrNull(data.periodStartUTC);
    if (parsedStartUTC) {
      periodStart = parsedStartUTC;
    } else if (data.periodType === "MONTHLY" && monthlyAt) {
      const parsedAt = parseMonthlyAtOrNull(monthlyAt);
      if (!parsedAt) {
        throw new HttpError(400, "Invalid at (expected YYYY-MM)");
      }
      periodStart = getMonthlyPeriodStartUTCForAt(timeZone, parsedAt);
    } else {
      periodStart = isoLocalDayToUTCDate(timeZone, data.periodStartISO!);
    }
  }

  const periodEnd = calcNextPeriodEnd(
    periodStart,
    data.periodType as PrismaPeriodType,
    timeZone,
  );

  const parsedAnchorUTC = parseIsoDateOrNull(data.periodAnchorUTC);
  const periodAnchor = parsedAnchorUTC
    ? parsedAnchorUTC
    : data.periodAnchorISO
      ? isoLocalDayToUTCDate(timeZone, data.periodAnchorISO)
      : undefined;

  const currency = (data.currency ??
    data.homeCurrency ??
    data.displayCurrency ??
    user.currency) as CurrencyCode;

  const language = (data.language ?? user.language) as LanguageCode;

  const plan = await planRepo.upsertPlan(
    userId,
    data.periodType as PrismaPeriodType,
    periodStart,
    {
      userId,
      periodType: data.periodType as PrismaPeriodType,
      periodStart,
      periodEnd,
      periodAnchor,
      timeZone: planTimeZone,
      currency,
      language,
      totalBudgetLimitMinor: data.totalBudgetLimitMinor ?? 0,
    },
    {
      periodEnd,
      periodAnchor,
      timeZone: planTimeZone,
      currency,
      language,
      totalBudgetLimitMinor: data.totalBudgetLimitMinor,
    },
  );

  if (setActive) {
    await planRepo.setUserActivePlanId(userId, plan.id);
  } else {
    let shouldSetActive = false;
    if (!user.activePlanId) {
      shouldSetActive = true;
    } else {
      const activeExists = await planRepo.findPlanExists(user.activePlanId);
      if (!activeExists) shouldSetActive = true;
    }
    if (shouldSetActive) {
      await planRepo.setUserActivePlanId(userId, plan.id);
    }
  }

  return toServerPlanDTO(plan, timeZone);
}

function normalizeCategoryKey(v: unknown): string {
  return (
    String(v ?? "uncategorized")
      .trim()
      .toLowerCase() || "uncategorized"
  );
}

function normalizeSavingsId(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function normalizeSavingsName(v: unknown): string {
  return String(v ?? "").trim();
}

function normalizeSavingsNameLower(v: unknown): string {
  return normalizeSavingsName(v).toLowerCase();
}

export async function getBudgetGoals(
  userId: string,
  planId: string,
): Promise<{ goals: unknown[] }> {
  const plan = await planRepo.findPlanWithBudgetGoals(planId);
  if (!plan) throw new HttpError(404, "Plan not found");
  if (plan.userId !== userId) throw new HttpError(403, "Forbidden");
  return { goals: plan.budgetGoals ?? [] };
}

export async function upsertBudgetGoal(
  userId: string,
  planId: string,
  body: UpsertBudgetGoalRequestDTO,
): Promise<{ ok: true } | { plan: ServerPlanDTO }> {
  const plan = await planRepo.findPlanForOwnership(planId);
  if (!plan) throw new HttpError(404, "Plan not found");
  if (plan.userId !== userId) throw new HttpError(403, "Forbidden");

  const categoryKey = normalizeCategoryKey(body.category);
  const limitMinor = Math.trunc(Number(body.limitMinor) || 0);

  if (limitMinor <= 0) {
    await planRepo.executeTransaction(async (tx) => {
      await planRepo.deleteBudgetGoalsByCategory(tx, planId, categoryKey);
    });
    return { ok: true };
  }

  const updated = await planRepo.executeTransaction(async (tx) => {
    const matches = await planRepo.findBudgetGoalsByCategory(
      tx,
      planId,
      categoryKey,
    );
    const keep = matches[0];
    const extras = matches.slice(1);

    if (extras.length) {
      await planRepo.deleteBudgetGoalExtras(
        tx,
        extras.map((x) => x.id),
      );
    }

    if (keep?.id) {
      await planRepo.updateBudgetGoal(tx, keep.id, {
        limitMinor,
        category: categoryKey,
      });
    } else {
      await planRepo.createBudgetGoal(tx, {
        planId,
        category: categoryKey,
        limitMinor,
      });
    }

    const full = await planRepo.findPlanByIdWithGoalsTx(tx, planId);
    return full;
  });

  if (!updated) throw new HttpError(404, "Plan not found");
  const timeZone =
    typeof updated.timeZone === "string" && updated.timeZone.trim()
      ? updated.timeZone.trim()
      : "UTC";
  return { plan: toServerPlanDTO(updated, timeZone) };
}

export async function patchBudgetGoals(
  userId: string,
  planId: string,
  body: PatchBudgetGoalsRequestDTO,
): Promise<{ plan: ServerPlanDTO }> {
  const plan = await planRepo.findPlanForOwnership(planId);
  if (!plan) throw new HttpError(404, "Plan not found");
  if (plan.userId !== userId) throw new HttpError(403, "Forbidden");

  const byCategory = new Map<string, number>();
  for (const g of body.budgetGoals) {
    const category = normalizeCategoryKey(g.category);
    const limitMinor = Math.max(
      0,
      Math.trunc(Number((g as { limitMinor?: unknown }).limitMinor) || 0),
    );
    if (!category) continue;
    byCategory.set(category, limitMinor);
  }

  const updated = await planRepo.executeTransaction(async (tx) => {
    const ops: Promise<void>[] = [];
    for (const [categoryKey, limitMinor] of byCategory.entries()) {
      if (limitMinor <= 0) {
        ops.push(
          planRepo
            .deleteBudgetGoalsByCategory(tx, planId, categoryKey)
            .then(() => {}),
        );
        continue;
      }

        ops.push(
          (async () => {
            const matches = await planRepo.findBudgetGoalsByCategory(
              tx,
              planId,
              categoryKey,
            );
            const keep = matches[0];
            const extras = matches.slice(1);

            if (extras.length) {
              await planRepo.deleteBudgetGoalExtras(
                tx,
                extras.map((x) => x.id),
              );
            }

            if (keep?.id) {
              await planRepo.updateBudgetGoal(tx, keep.id, {
                limitMinor,
                category: categoryKey,
              });
            } else {
              await planRepo.createBudgetGoal(tx, {
                planId,
                category: categoryKey,
                limitMinor,
              });
            }
          })(),
        );
    }

    await Promise.all(ops);

    const full = await planRepo.findPlanByIdWithGoalsTx(tx, planId);
    return full;
  });

  if (!updated) throw new HttpError(404, "Plan not found");
  const timeZone =
    typeof updated.timeZone === "string" && updated.timeZone.trim()
      ? updated.timeZone.trim()
      : "UTC";
  return { plan: toServerPlanDTO(updated, timeZone) };
}

export async function getSavingsGoals(
  userId: string,
  planId: string,
): Promise<{ goals: unknown[] }> {
  const plan = await planRepo.findPlanWithSavingsGoals(planId);
  if (!plan) throw new HttpError(404, "Plan not found");
  if (plan.userId !== userId) throw new HttpError(403, "Forbidden");
  return { goals: plan.savingsGoals ?? [] };
}

export async function upsertSavingsGoal(
  userId: string,
  planId: string,
  body: UpsertSavingsGoalRequestDTO,
): Promise<{ plan: ServerPlanDTO }> {
  const plan = await planRepo.findPlanForOwnership(planId);
  if (!plan) throw new HttpError(404, "Plan not found");
  if (plan.userId !== userId) throw new HttpError(403, "Forbidden");

  const rawId = normalizeSavingsId((body as { id?: unknown }).id);
  const name = normalizeSavingsName((body as { name?: unknown }).name);
  const cleanTarget = Math.max(
    0,
    Math.trunc(Number((body as { targetMinor?: unknown }).targetMinor) || 0),
  );

  if (!name) {
    throw new HttpError(400, "Name is required");
  }

  const result = await planRepo.executeTransaction(async (tx) => {
    const planCheck = await planRepo.findPlanForOwnershipTx(tx, planId);
    if (!planCheck) return { kind: "NOT_FOUND" } as const;
    if (planCheck.userId !== userId) return { kind: "FORBIDDEN" } as const;

    if (rawId) {
      const existing = await planRepo.findSavingsGoalById(tx, rawId, planId);
      if (existing?.id) {
        await planRepo.updateSavingsGoal(tx, rawId, {
          name,
          targetMinor: cleanTarget,
        });
      } else {
        const existingAny = await planRepo.findSavingsGoalByIdAny(tx, rawId);
        if (existingAny?.id && existingAny.planId !== planId) {
          return { kind: "BAD_REQUEST", error: "Invalid savingsGoal id" } as const;
        }
        const count = await planRepo.countSavingsGoals(tx, planId);
        if (count >= MAX_SAVINGS_GOALS_PER_PLAN) {
          return { kind: "LIMIT" } as const;
        }
        await planRepo.createSavingsGoal(tx, {
          planId,
          id: rawId,
          name,
          targetMinor: cleanTarget,
        });
      }
    } else {
      const matches = await planRepo.findSavingsGoalsByName(tx, planId, name);
      const keep = matches[0];
      const extras = matches.slice(1);

      if (extras.length) {
        await planRepo.deleteSavingsGoalExtras(
          tx,
          planId,
          extras.map((x) => x.id),
        );
      }

      if (keep?.id) {
        await planRepo.updateSavingsGoal(tx, keep.id, {
          name,
          targetMinor: cleanTarget,
        });
      } else {
        const count = await planRepo.countSavingsGoals(tx, planId);
        if (count >= MAX_SAVINGS_GOALS_PER_PLAN) {
          return { kind: "LIMIT" } as const;
        }
        await planRepo.createSavingsGoal(tx, {
          planId,
          name,
          targetMinor: cleanTarget,
        });
      }
    }

    const full = await planRepo.findPlanByIdWithGoalsTx(tx, planId);
    return { kind: "OK", plan: full } as const;
  });

  if (result.kind === "NOT_FOUND") throw new HttpError(404, "Plan not found");
  if (result.kind === "FORBIDDEN") throw new HttpError(403, "Forbidden");
  if (result.kind === "LIMIT")
    throw new HttpError(400, "Savings goals limit reached");
  if (result.kind === "BAD_REQUEST")
    throw new HttpError(400, "Invalid savingsGoal id");
  if (!result.plan) throw new HttpError(404, "Plan not found");

  const timeZone =
    typeof result.plan.timeZone === "string" && result.plan.timeZone.trim()
      ? result.plan.timeZone.trim()
      : "UTC";
  return { plan: toServerPlanDTO(result.plan, timeZone) };
}

export async function patchSavingsGoals(
  userId: string,
  planId: string,
  body: PatchSavingsGoalsRequestDTO,
): Promise<{ plan: ServerPlanDTO }> {
  const plan = await planRepo.findPlanForOwnership(planId);
  if (!plan) throw new HttpError(404, "Plan not found");
  if (plan.userId !== userId) throw new HttpError(403, "Forbidden");

  const result = await planRepo.executeTransaction(async (tx) => {
    const planCheck = await planRepo.findPlanForOwnershipTx(tx, planId);
    if (!planCheck) return { kind: "NOT_FOUND" } as const;
    if (planCheck.userId !== userId) return { kind: "FORBIDDEN" } as const;

    const existingGoals = await planRepo.findSavingsGoalsForPlan(tx, planId);
    const existingById = new Map<string, { id: string; name: string }>();
    const existingByNameLower = new Map<string, { id: string; name: string }>();

    for (const g of existingGoals) {
      existingById.set(g.id, { id: g.id, name: g.name });
      const key = normalizeSavingsNameLower(g.name);
      if (key && !existingByNameLower.has(key)) {
        existingByNameLower.set(key, { id: g.id, name: g.name });
      }
    }

    // Phase 1: compute final set of goal ids (validate count before any writes)
    const finalIds = new Set<string>();
    const simById = new Map(existingById);
    const simByNameLower = new Map(existingByNameLower);
    let simNewCounter = 0;

    for (const incoming of body.savingsGoals) {
      const id = normalizeSavingsId((incoming as { id?: unknown }).id);
      const name = normalizeSavingsName((incoming as { name?: unknown }).name);
      const nameLower = normalizeSavingsNameLower(name);
      if (!name) return { kind: "BAD_REQUEST", error: "Name is required" } as const;

      if (id) {
        const existingForPlan = simById.get(id);
        if (existingForPlan?.id) {
          finalIds.add(id);
          const prevLower = normalizeSavingsNameLower(existingForPlan.name);
          if (prevLower && simByNameLower.get(prevLower)?.id === id) {
            simByNameLower.delete(prevLower);
          }
          simById.set(id, { id, name });
          if (nameLower) simByNameLower.set(nameLower, { id, name });
        } else {
          const existingAny = await planRepo.findSavingsGoalByIdAny(tx, id);
          if (existingAny?.id && existingAny.planId !== planId) {
            return { kind: "BAD_REQUEST", error: "Invalid savingsGoal id" } as const;
          }
          finalIds.add(id);
          simById.set(id, { id, name });
          if (nameLower) simByNameLower.set(nameLower, { id, name });
        }
      } else {
        const existing = simByNameLower.get(nameLower);
        if (existing?.id) {
          finalIds.add(existing.id);
          simById.set(existing.id, { id: existing.id, name });
          if (nameLower) simByNameLower.set(nameLower, { id: existing.id, name });
        } else {
          const newId = `__new_${simNewCounter++}`;
          finalIds.add(newId);
          simByNameLower.set(nameLower, { id: newId, name });
        }
      }
    }

    if (finalIds.size > MAX_SAVINGS_GOALS_PER_PLAN) {
      return { kind: "LIMIT" } as const;
    }

    // Phase 2: perform mutations (same resolution logic, now with DB writes)
    const keepIds = new Set<string>();

    for (const incoming of body.savingsGoals) {
      const id = normalizeSavingsId((incoming as { id?: unknown }).id);
      const name = normalizeSavingsName((incoming as { name?: unknown }).name);
      const nameLower = normalizeSavingsNameLower(name);
      const targetMinor = Math.max(
        0,
        Math.trunc(Number((incoming as { targetMinor?: unknown }).targetMinor) || 0),
      );

      if (!name) {
        return { kind: "BAD_REQUEST", error: "Name is required" } as const;
      }

      if (id) {
        const existingForPlan = existingById.get(id);

        if (existingForPlan?.id) {
          const prevLower = normalizeSavingsNameLower(existingForPlan.name);
          const updated = await planRepo.updateSavingsGoal(tx, id, {
            name,
            targetMinor,
          });
          keepIds.add(updated.id);
          existingById.set(updated.id, { id: updated.id, name });
          if (prevLower && existingByNameLower.get(prevLower)?.id === id) {
            existingByNameLower.delete(prevLower);
          }
          if (nameLower) {
            existingByNameLower.set(nameLower, { id: updated.id, name });
          }
        } else {
          const existingAny = await planRepo.findSavingsGoalByIdAny(tx, id);
          if (existingAny?.id && existingAny.planId !== planId) {
            return {
              kind: "BAD_REQUEST",
              error: "Invalid savingsGoal id",
            } as const;
          }

          const created = await planRepo.createSavingsGoal(tx, {
            planId,
            id,
            name,
            targetMinor,
          });
          keepIds.add(created.id);
          existingById.set(created.id, { id: created.id, name });
          if (nameLower) {
            existingByNameLower.set(nameLower, { id: created.id, name });
          }
        }
        continue;
      }

      const existing = nameLower
        ? existingByNameLower.get(nameLower)
        : undefined;
      if (existing?.id) {
        const prevLower = normalizeSavingsNameLower(existing.name);
        const updated = await planRepo.updateSavingsGoal(tx, existing.id, {
          name,
          targetMinor,
        });
        keepIds.add(updated.id);
        existingById.set(updated.id, { id: updated.id, name });
        if (prevLower && prevLower !== nameLower) {
          if (existingByNameLower.get(prevLower)?.id === updated.id) {
            existingByNameLower.delete(prevLower);
          }
        }
        if (nameLower) {
          existingByNameLower.set(nameLower, { id: updated.id, name });
        }
      } else {
        const created = await planRepo.createSavingsGoal(tx, {
          planId,
          name,
          targetMinor,
        });
        keepIds.add(created.id);
        existingById.set(created.id, { id: created.id, name });
        if (nameLower) {
          existingByNameLower.set(nameLower, { id: created.id, name });
        }
      }
    }

    await planRepo.deleteSavingsGoalsNotIn(
      tx,
      planId,
      Array.from(keepIds),
    );

    const updated = await planRepo.findPlanByIdWithGoalsTx(tx, planId);
    if (!updated) return { kind: "NOT_FOUND" } as const;
    return { kind: "OK", plan: updated } as const;
  });

  if (result.kind === "NOT_FOUND") throw new HttpError(404, "Plan not found");
  if (result.kind === "FORBIDDEN") throw new HttpError(403, "Forbidden");
  if (result.kind === "LIMIT")
    throw new HttpError(400, "Savings goals limit reached");
  if (result.kind === "BAD_REQUEST")
    throw new HttpError(400, result.error ?? "Invalid request");
  if (!result.plan) throw new HttpError(404, "Plan not found");

  const timeZone =
    typeof result.plan.timeZone === "string" && result.plan.timeZone.trim()
      ? result.plan.timeZone.trim()
      : "UTC";
  return { plan: toServerPlanDTO(result.plan, timeZone) };
}

export async function rollover(
  userId: string,
): Promise<
  | { rolled: true; createdCount: number; plan: ServerPlanDTO | null }
  | { rolled: false; plan: null; error?: string; reason?: string }
> {
  const user = await planRepo.findUserWithActivePlan(userId);
  if (!user || !user.activePlan) {
    return { rolled: false, plan: null, error: "No active plan found" };
  }

  const now = new Date();
  const current = user.activePlan;
  const periodType = current.periodType;
  const timeZone = user.timeZone || "UTC";

  const currentEnd = ensurePeriodEnd(
    current.periodStart,
    current.periodEnd,
    periodType,
    timeZone,
  );

  if (currentEnd > now) {
    return {
      rolled: false,
      reason: "Plan is still active",
      plan: null,
    };
  }

  const result = await planRepo.executeTransaction(async (tx) => {
    const budgetGoals = await planRepo.findBudgetGoalsForPlan(tx, current.id);
    const savingsGoals = await planRepo.findSavingsGoalsForPlanFull(
      tx,
      current.id,
    );

    let nextStart: Date = currentEnd;
    let createdCount = 0;
    let lastPlanId: string | null = null;

    for (let i = 0; i < 36; i++) {
      const nextEnd = calcNextPeriodEnd(nextStart, periodType, timeZone);
      const key = {
        userId: user.id,
        periodType: current.periodType,
        periodStart: nextStart,
      };

      let plan = await planRepo.findPlanByUniqueKeyTx(
        tx,
        key.userId,
        key.periodType,
        key.periodStart,
      );
      let created = false;

      if (!plan) {
        try {
          plan = await planRepo.createPlanInTx(tx, {
            userId: user.id,
            periodType: current.periodType,
            periodStart: nextStart,
            periodEnd: nextEnd,
            periodAnchor: nextStart,
            timeZone,
            currency: current.currency,
            language: current.language,
            totalBudgetLimitMinor: current.totalBudgetLimitMinor ?? 0,
          });
          created = true;
          createdCount += 1;
        } catch (e: unknown) {
          const err = e as { code?: string };
          if (err?.code === "P2002") {
            plan = await planRepo.findPlanByUniqueKeyTx(
              tx,
              key.userId,
              key.periodType,
              key.periodStart,
            );
            created = false;
          }
          if (!plan) throw e;
        }
      }

      if (created && plan) {
        await planRepo.createBudgetGoalsInTx(
          tx,
          plan.id,
          budgetGoals.map((g) => ({
            category: g.category,
            limitMinor: g.limitMinor,
          })),
        );
        await planRepo.createSavingsGoalsInTx(
          tx,
          plan.id,
          savingsGoals.map((g) => ({
            name: g.name,
            targetMinor: g.targetMinor,
          })),
        );
      }

      lastPlanId = plan.id;
      const planEnd = plan.periodEnd ?? nextEnd;
      nextStart = planEnd;

      if (planEnd > now) break;
    }

    if (!lastPlanId) {
      return { createdCount: 0, activePlan: null };
    }

    await planRepo.setUserActivePlanIdTx(tx, user.id, lastPlanId);
    const activePlan = await planRepo.findPlanByIdWithGoalsTx(tx, lastPlanId);

    return { createdCount, activePlan };
  });

  const planDto = result.activePlan
    ? toServerPlanDTO(result.activePlan, timeZone)
    : null;

  return {
    rolled: true,
    createdCount: result.createdCount,
    plan: planDto,
  };
}

function toPrismaCurrency(c: string | undefined): CurrencyCode | undefined {
  if (c === "USD") return CurrencyCode.USD;
  if (c === "KRW") return CurrencyCode.KRW;
  return undefined;
}

function toPrismaPeriodType(
  p: string | undefined,
): PrismaPeriodType | undefined {
  if (p === "WEEKLY") return PrismaPeriodType.WEEKLY;
  if (p === "BIWEEKLY") return PrismaPeriodType.BIWEEKLY;
  if (p === "MONTHLY") return PrismaPeriodType.MONTHLY;
  return undefined;
}

export async function switchCurrency(
  userId: string,
  body: SwitchCurrencyRequestDTO,
): Promise<{ plan: ServerPlanDTO }> {
  const switchMode: SwitchMode = body.switchMode ?? "PERIOD_AND_CURRENCY";
  const goalsMode: GoalsMode = body.goalsMode ?? "COPY_AS_IS";

  const activePlan = await planRepo.ensureActivePlanWithGoals(userId);

  const user = await planRepo.findUserForPlanPrefs(userId);
  const timeZone = body.timeZone || user?.timeZone || "UTC";

  const requestedPeriodType = toPrismaPeriodType(body.periodType);
  const requestedCurrency = toPrismaCurrency(body.currency);

  const targetPeriodType: PrismaPeriodType =
    switchMode === "CURRENCY_ONLY"
      ? (activePlan.periodType as PrismaPeriodType)
      : (requestedPeriodType ?? (activePlan.periodType as PrismaPeriodType));

  const targetCurrency: CurrencyCode =
    switchMode === "PERIOD_ONLY"
      ? (activePlan.currency as CurrencyCode)
      : (requestedCurrency ?? (activePlan.currency as CurrencyCode));

  const nowUTC = new Date();
  const period = buildPeriodForNowUTC({
    nowUTC,
    periodType: targetPeriodType,
    timeZone,
    periodAnchorUTC: activePlan.periodAnchor,
  });

  const result = await planRepo.executeTransaction(async (tx) => {
    const plan = await planRepo.upsertPlanForSwitchCurrency(tx, {
      userId,
      periodType: targetPeriodType,
      periodStart: period.periodStartUTC,
      periodEnd: period.periodEndUTC,
      periodAnchor: period.periodAnchorUTC,
      timeZone,
      language: (activePlan.language ?? "en") as LanguageCode,
      currency: targetCurrency,
      totalBudgetLimitMinor: Number(activePlan.totalBudgetLimitMinor ?? 0),
    });

    if (goalsMode !== "RESET_EMPTY") {
      const fromCurrency = activePlan.currency;
      const toCurrency = targetCurrency;
      const fx = typeof body.fxUsdKrw === "number" ? body.fxUsdKrw : null;

      const converted = convertPlanMinorPayload({
        fromCurrency,
        toCurrency,
        fxUsdKrw: fx,
        goalsMode,
        activePlan: {
          id: activePlan.id,
          userId: activePlan.userId,
          currency: activePlan.currency,
          totalBudgetLimitMinor: activePlan.totalBudgetLimitMinor,
          budgetGoals: activePlan.budgetGoals ?? [],
          savingsGoals: activePlan.savingsGoals ?? [],
        },
      });

      const { totalBudgetLimitMinor, budgetGoals, savingsGoals } = converted;

      await planRepo.updatePlanTotalBudgetTx(
        tx,
        plan.id,
        totalBudgetLimitMinor,
      );

      for (const g of budgetGoals) {
        await planRepo.upsertBudgetGoalByCategoryTx(
          tx,
          plan.id,
          g.category,
          g.limitMinor,
        );
      }

      for (const s of savingsGoals) {
        await planRepo.upsertSavingsGoalByNameTx(
          tx,
          plan.id,
          s.name,
          s.targetMinor,
        );
      }
    }

    await planRepo.setUserActivePlanIdTx(tx, userId, plan.id);

    return planRepo.findPlanByIdWithGoalsTx(tx, plan.id);
  });

  if (!result) {
    throw new HttpError(500, "Plan not found after upsert");
  }

  return { plan: toServerPlanDTO(result, timeZone) };
}
