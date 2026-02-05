// apps/mobile/src/app/api/userApi.ts

import { request } from "./http";
import type { UserMeDTO, PatchUserMeRequestDTO } from "@pq/shared/user/types";

export const userApi = {
  getMe: async (token: string): Promise<UserMeDTO> => {
    return request<UserMeDTO>("/api/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  updateMe: async (token: string, data: PatchUserMeRequestDTO): Promise<UserMeDTO> => {
    return request<UserMeDTO>("/api/users/me", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  },
};
