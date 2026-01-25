import { request } from "./http";

export const plansApi = {
  get: async (token: string) => {
    return request<any>("/api/plans", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  update: async (token: string, data: any) => {
    return request<any>("/api/plans", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },
};
