import { request } from "./http";
import type {
  ServerPlanDTO,
  PatchBudgetGoalsRequestDTO,
  UpsertBudgetGoalRequestDTO,
  PatchSavingsGoalsRequestDTO,
  UpsertSavingsGoalRequestDTO,
} from "../../../../../packages/shared/src/plans/types";

export const goalsApi = {
  budget: {
    getAll: async (token: string, planId: string) => {
      return request<ServerPlanDTO>(`/api/plans/${planId}/goals/budget`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    upsert: async (
      token: string,
      planId: string,
      data: UpsertBudgetGoalRequestDTO,
    ) => {
      return request<{ plan: ServerPlanDTO }>(
        `/api/plans/${planId}/goals/budget`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(data),
        },
      );
    },
  },
  savings: {
    getAll: async (token: string, planId: string) => {
      return request<ServerPlanDTO>(`/api/plans/${planId}/goals/savings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    create: async (
      token: string,
      planId: string,
      data: UpsertSavingsGoalRequestDTO,
    ) => {
      return request<{ plan: ServerPlanDTO }>(
        `/api/plans/${planId}/goals/savings`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(data),
        },
      );
    },
    delete: async (token: string, planId: string, id: string) => {
      return request<{ plan: ServerPlanDTO }>(
        `/api/plans/${planId}/goals/savings?id=${id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
    },
  },
};
