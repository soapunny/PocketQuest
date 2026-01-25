import { request } from "./http";

export const authApi = {
  signIn: async (data: {
    provider: "google" | "kakao";
    providerId: string;
    email: string;
    name: string;
    profileImageUri?: string | null;
  }) => {
    return request<{ token: string; user: any }>("/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

