// apps/mobile/src/app/api/http.ts

import { API_BASE_URL } from "../config/env";

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public details?: any,
    public url?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const base = String(API_BASE_URL ?? "").replace(/\/$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${base}${path}`;

  const headers = new Headers(options.headers as any);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text().catch(() => "");

    const err = new ApiError(
      response.status,
      response.status === 401 ? "Unauthorized" : `HTTP ${response.status}`,
      text,
      url,
    );
    throw err;
  }

  if (response.status === 204) return undefined as any; //성공 했지만 body가 없는 경우

  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json"))
    return (await response.json()) as T; //성공 했고 body가 json인 경우 요청 타입 T로 변환해서 반환
  return (await response.text()) as any;
}
