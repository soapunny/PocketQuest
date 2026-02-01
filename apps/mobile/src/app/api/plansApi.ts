// apps/mobile/src/app/api/plansApi.ts

import { request } from "./http";

import type {
  ServerPlanDTO,
  PatchPlanDTO,
  MonthlyPlansListResponseDTO,
  GetBudgetGoalsResponseDTO,
  UpsertBudgetGoalRequestDTO,
  PatchBudgetGoalsRequestDTO,
  GetSavingsGoalsResponseDTO,
  UpsertSavingsGoalRequestDTO,
  PatchSavingsGoalsRequestDTO,
  SwitchCurrencyRequestDTO,
} from "../../../../../packages/shared/src/plans/types";

function normalizeServerPlanDTO(payload: any): ServerPlanDTO {
  // Server responses may wrap the plan under { plan }, or use legacy keys like { activePlan }.
  const p = payload?.plan ?? payload?.activePlan ?? payload;
  return p as ServerPlanDTO;
}

function normalizePlanEnvelope(payload: any): { plan: ServerPlanDTO } {
  return { plan: normalizeServerPlanDTO(payload) };
}

// NOTE:
// - GET /api/plans normally returns a single plan payload (ServerPlanDTO)
// - GET /api/plans with periodType=MONTHLY&at&months may return a monthly list payload
//   (MonthlyPlansListResponseDTO). Most screens will only use the single plan.

export const plansApi = {
  // Active plan payload
  getActive: async (token: string): Promise<{ plan: ServerPlanDTO }> => {
    const res = await request<any>("/api/plans", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return normalizePlanEnvelope(res);
  },

  // Back-compat alias
  get: async (token: string): Promise<{ plan: ServerPlanDTO }> => {
    return plansApi.getActive(token);
  },

  // Optional: monthly list (dashboard/analytics)
  getMonthlyList: async (
    token: string,
    params: { at: string; months: number | string }
  ) => {
    const qs = new URLSearchParams();
    qs.set("periodType", "MONTHLY");
    qs.set("at", params.at);
    qs.set("months", String(params.months));

    return request<MonthlyPlansListResponseDTO>(`/api/plans?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  update: async (
    token: string,
    data: PatchPlanDTO
  ): Promise<{ plan: ServerPlanDTO }> => {
    const res = await request<any>("/api/plans", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    return normalizePlanEnvelope(res);
  },

  // ---------------------------------------------------------------------
  // Budget goals endpoints (SSOT)
  // /api/plans/[id]/goals/budget
  // ---------------------------------------------------------------------

  getBudgetGoals: async (token: string, planId: string) => {
    return request<GetBudgetGoalsResponseDTO>(
      `/api/plans/${planId}/goals/budget`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  },

  upsertBudgetGoal: async (
    token: string,
    planId: string,
    data: UpsertBudgetGoalRequestDTO
  ): Promise<{ plan: ServerPlanDTO }> => {
    const res = await request<any>(`/api/plans/${planId}/goals/budget`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    return normalizePlanEnvelope(res);
  },

  patchBudgetGoals: async (
    token: string,
    planId: string,
    data: PatchBudgetGoalsRequestDTO
  ): Promise<{ plan: ServerPlanDTO }> => {
    const res = await request<any>(`/api/plans/${planId}/goals/budget`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    return normalizePlanEnvelope(res);
  },

  // ---------------------------------------------------------------------
  // Savings goals endpoints (SSOT)
  // /api/plans/[id]/goals/savings
  // ---------------------------------------------------------------------

  getSavingsGoals: async (token: string, planId: string) => {
    return request<GetSavingsGoalsResponseDTO>(
      `/api/plans/${planId}/goals/savings`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  },

  upsertSavingsGoal: async (
    token: string,
    planId: string,
    data: UpsertSavingsGoalRequestDTO
  ): Promise<{ plan: ServerPlanDTO }> => {
    const res = await request<any>(`/api/plans/${planId}/goals/savings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    return normalizePlanEnvelope(res);
  },

  patchSavingsGoals: async (
    token: string,
    planId: string,
    data: PatchSavingsGoalsRequestDTO
  ): Promise<{ plan: ServerPlanDTO }> => {
    const res = await request<any>(`/api/plans/${planId}/goals/savings`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    return normalizePlanEnvelope(res);
  },

  // ---------------------------------------------------------------------
  // Rollover (SSOT)
  // POST /api/plans/actions/rollover
  // ---------------------------------------------------------------------
  rollover: async (token: string) => {
    const res = await request<any>("/api/plans/actions/rollover", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    // Normalize possible server response keys: { plan }, { activePlan }, or no plan.
    const plan = res?.plan ?? res?.activePlan ?? null;
    return {
      ...res,
      ...(plan ? { plan: normalizeServerPlanDTO(plan) } : {}),
    } as { rolled: boolean; plan?: ServerPlanDTO | null };
  },

  // ---------------------------------------------------------------------
  // Switch currency (SSOT)
  // POST /api/plans/[id]/actions/switch-currency
  // ---------------------------------------------------------------------
  switchCurrency: async (
    token: string,
    planId: string,
    data: SwitchCurrencyRequestDTO
  ): Promise<{ plan: ServerPlanDTO }> => {
    const res = await request<any>(
      `/api/plans/${planId}/actions/switch-currency`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      }
    );
    return normalizePlanEnvelope(res);
  },
};
