import { request } from "./http";

export const transactionsApi = {
  getAll: async (token: string) => {
    return request<any[]>("/api/transactions", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  create: async (token: string, data: any) => {
    return request<any>("/api/transactions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },
  update: async (token: string, id: string, data: any) => {
    return request<any>(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },
  delete: async (token: string, id: string) => {
    return request<{ success: boolean }>(`/api/transactions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};
