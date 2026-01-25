// apps/mobile/src/app/api/http.ts
import { API_BASE_URL } from "../config/env";

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public details?: any,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new ApiError(response.status, error.error || "Request failed", error);
  }

  return response.json();
}
