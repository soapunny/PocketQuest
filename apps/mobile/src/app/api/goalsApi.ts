import { request } from "./http";

export const goalsApi = {
  budget: {
    getAll: async (token: string) => {
      return request<any[]>("/api/plans/budget-goals", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    upsert: async (
      token: string,
      data: { category: string; limitMinor: number },
    ) => {
      return request<any>("/api/plans/budget-goals", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
    },
  },
  savings: {
    getAll: async (token: string) => {
      return request<any[]>("/api/plans/savings-goals", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    create: async (
      token: string,
      data: { name: string; targetMinor: number },
    ) => {
      return request<any>("/api/plans/savings-goals", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
    },
    delete: async (token: string, id: string) => {
      return request<{ success: boolean }>(`/api/plans/savings-goals?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  },
};
