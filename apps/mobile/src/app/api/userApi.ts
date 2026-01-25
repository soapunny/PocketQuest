import { request } from "./http";

export const userApi = {
  getMe: async (token: string) => {
    return request<any>("/api/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  updateMe: async (
    token: string,
    data: { name?: string; profileImageUri?: string | null },
  ) => {
    return request<any>("/api/users/me", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },
};

