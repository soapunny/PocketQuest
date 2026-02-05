// packages/shared/src/plans/types.ts

import { z } from "zod";

import type { Currency } from "../money/types";
import { CURRENCY_VALUES, currencySchema } from "../money/types";

// ---------------------------------------------------------------------------
// 1) Common enum/union types (SSOT)
// ---------------------------------------------------------------------------

export const PLAN_PERIOD_TYPE_VALUES = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
] as const;
export type PlanPeriodType = (typeof PLAN_PERIOD_TYPE_VALUES)[number];

export const LANGUAGE_VALUES = ["en", "ko"] as const;
export type Language = (typeof LANGUAGE_VALUES)[number];

// Back-compat aliases (avoid breaking existing imports)
export const PERIOD_TYPE_VALUES = PLAN_PERIOD_TYPE_VALUES;
export type PeriodType = PlanPeriodType;
export const UI_LANGUAGE_VALUES = LANGUAGE_VALUES;
export type UILanguage = Language;

export const SWITCH_MODE_VALUES = [
  "PERIOD_ONLY",
  "CURRENCY_ONLY",
  "PERIOD_AND_CURRENCY",
] as const;
export type SwitchMode = (typeof SWITCH_MODE_VALUES)[number];

export const GOALS_MODE_VALUES = [
  "CONVERT_USING_FX",
  "RESET_EMPTY",
  "COPY_AS_IS",
] as const;
export type GoalsMode = (typeof GOALS_MODE_VALUES)[number];

// ---------------------------------------------------------------------------
// 2) API DTO (network contract)
// - Keep category as string to avoid coupling shared package to mobile-only
//   category key lists.
// - Keep UTC instants as ISO strings.
// ---------------------------------------------------------------------------

// NOTE: server should send UTC instants using *UTC-suffixed* keys only (periodStartUTC/periodEndUTC/periodAnchorUTC).
export type BudgetGoalDTO = {
  id?: string | null;
  category: string;
  limitMinor?: number | null;
};

export type SavingsGoalDTO = {
  id?: string | null;
  name: string;
  targetMinor?: number | null;
};

// Server plan payload as used by mobile applyServerPlan.
export const serverPlanDTOSchema = z
  .object({
    id: z.string().min(1).optional(),
    periodType: z.enum(PLAN_PERIOD_TYPE_VALUES).optional(),
    currency: z.enum(CURRENCY_VALUES).optional(),
    language: z.enum(LANGUAGE_VALUES).optional().nullable(),

    periodStartUTC: z.string().datetime().optional(),
    periodEndUTC: z.string().datetime().optional(),
    periodAnchorUTC: z.string().datetime().optional(),

    timeZone: z.string().min(1).optional(),
    totalBudgetLimitMinor: z.number().int().nonnegative().optional().nullable(),

    // Keep these for compatibility with existing store logic, but treat `currency` as canonical.
    homeCurrency: z.enum(CURRENCY_VALUES).optional(),
    displayCurrency: z.enum(CURRENCY_VALUES).optional(),

    budgetGoals: z
      .array(
        z.object({
          id: z.string().optional().nullable(),
          category: z.string().min(1),
          limitMinor: z.number().int().nonnegative().optional().nullable(),
        })
      )
      .optional()
      .nullable(),
    savingsGoals: z
      .array(
        z.object({
          id: z.string().optional().nullable(),
          name: z.string().min(1),
          targetMinor: z.number().int().nonnegative().optional().nullable(),
        })
      )
      .optional()
      .nullable(),
  })
  .passthrough();

export type ServerPlanDTO = z.infer<typeof serverPlanDTOSchema>;

// ---------------------------------------------------------------------------
// 3) Domain model shape (client-friendly)
// - Mobile should always have required values for stable UI usage.
// ---------------------------------------------------------------------------

export type BudgetGoal = {
  id: string;
  category: string;
  limitMinor: number;
};

export type SavingsGoal = {
  id: string;
  name: string;
  targetMinor: number;
};

export type Plan = {
  periodType: PlanPeriodType;
  currency: Currency;
  language: Language;

  // Local date strings used by the UI.
  periodStartISO: string;
  periodEndISO: string;

  // UTC instants (server source-of-truth)
  periodStartUTC?: string;
  periodEndUTC?: string;
  periodAnchorUTC?: string;
  timeZone?: string;

  // Optional multi-currency fields (kept for compatibility)
  homeCurrency: Currency;
  displayCurrency: Currency;
  advancedCurrencyMode?: boolean;

  totalBudgetLimitMinor: number;
  budgetGoals: BudgetGoal[];
  savingsGoals: SavingsGoal[];
};

export type PatchPlanDTO = z.infer<typeof patchPlanSchema>;
export type GetPlanQueryDTO = z.infer<typeof getPlanQuerySchema>;

export const periodTypeSchema = z.enum(PLAN_PERIOD_TYPE_VALUES);
export const languageSchema = z.enum(LANGUAGE_VALUES);
export const uiLanguageSchema = languageSchema;

export const budgetGoalDTOSchema = z.object({
  id: z.string().optional().nullable(),
  category: z.string().min(1),
  limitMinor: z.number().int().nonnegative().optional().nullable(),
});

export const savingsGoalDTOSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().min(1),
  targetMinor: z.number().int().nonnegative().optional().nullable(),
});

export const patchPlanSchema = z.object({
  periodType: periodTypeSchema,

  periodAnchorISO: z.string().min(1).optional(),
  periodAnchorUTC: z.string().datetime().optional(),

  periodStartISO: z.string().min(1).optional(),
  periodStartUTC: z.string().datetime().optional(),

  // Partial goal updates (sending 0 deletes goal on the server)
  budgetGoals: z.array(budgetGoalDTOSchema).optional(),
  savingsGoals: z.array(savingsGoalDTOSchema).optional(),

  at: z.string().min(1).optional(),

  currency: currencySchema.optional(),
  homeCurrency: currencySchema.optional(),
  displayCurrency: currencySchema.optional(),

  advancedCurrencyMode: z.boolean().optional(),
  language: uiLanguageSchema.optional(),

  totalBudgetLimitMinor: z.number().int().nonnegative().optional(),

  setActive: z.boolean().optional(),
  useCurrentPeriod: z.boolean().optional(),
});
export const getPlanQuerySchema = z.object({
  periodType: periodTypeSchema.optional(),
  periodStartISO: z.string().min(1).optional(),

  at: z.string().min(1).optional(),
  months: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Budget goals endpoints (SSOT)
// ---------------------------------------------------------------------------

// NOTE: These DTOs are for /api/plans/[id]/goals/budget endpoints.
// They are intentionally strict (limitMinor is required).

export type BudgetGoalItemDTO = {
  id?: string | null;
  category: string;
  limitMinor: number;
};

export type GetBudgetGoalsResponseDTO = BudgetGoalItemDTO[];

export type UpsertBudgetGoalRequestDTO = {
  category: string;
  limitMinor: number;
};

export type PatchBudgetGoalsRequestDTO = {
  budgetGoals: Array<{ category: string; limitMinor: number }>;
};

export const budgetGoalItemSchema = z.object({
  id: z.string().optional().nullable(),
  category: z.string().min(1),
  limitMinor: z.number().int().nonnegative(),
});

export const upsertBudgetGoalRequestSchema = z.object({
  category: z.string().min(1),
  limitMinor: z.number().int().nonnegative(),
});

export const patchBudgetGoalsRequestSchema = z.object({
  budgetGoals: z.array(
    z.object({
      category: z.string().min(1),
      limitMinor: z.number().int().nonnegative(),
    })
  ),
});

// ---------------------------------------------------------------------------
// Savings goals endpoints (SSOT)
// /api/plans/[id]/goals/savings
// ---------------------------------------------------------------------------

export type SavingsGoalItemDTO = {
  id?: string | null;
  name: string;
  targetMinor: number;
};

export type GetSavingsGoalsResponseDTO = SavingsGoalItemDTO[];

export type UpsertSavingsGoalRequestDTO = {
  name: string;
  targetMinor: number;
};

export type PatchSavingsGoalsRequestDTO = {
  savingsGoals: Array<{
    id?: string | null;
    name: string;
    targetMinor: number;
  }>;
};

export const savingsGoalItemSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().min(1),
  targetMinor: z.number().int().nonnegative(),
});

export const upsertSavingsGoalRequestSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().min(1),
  targetMinor: z.number().int().nonnegative(),
});

export const patchSavingsGoalsRequestSchema = z.object({
  savingsGoals: z.array(savingsGoalItemSchema),
});

// ---------------------------------------------------------------------------
// Switch-currency request (SSOT)
// ---------------------------------------------------------------------------

export const switchCurrencyRequestSchema = z.object({
  periodType: periodTypeSchema.optional(),
  currency: currencySchema.optional(),

  switchMode: z.enum(SWITCH_MODE_VALUES).optional(),
  goalsMode: z.enum(GOALS_MODE_VALUES).optional(),

  fxUsdKrw: z.number().optional().nullable(),
  timeZone: z.string().min(1).optional(),
});

export type SwitchCurrencyRequestDTO = z.infer<
  typeof switchCurrencyRequestSchema
>;

export type MonthlyPlansListItemDTO = {
  periodStartUTC: string;
  plan: ServerPlanDTO | null;
};

export type MonthlyPlansListResponseDTO = {
  timeZone: string;
  periodType: "MONTHLY";
  at: string | null;
  months: string | null;
  items: MonthlyPlansListItemDTO[];
};
