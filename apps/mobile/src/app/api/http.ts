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
  const base = String(API_BASE_URL ?? "").replace(/\/$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${base}${path}`;

  const headers = new Headers(options.headers as any);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text().catch(() => "");

    const err: any = new Error(
      response.status === 401 ? "Unauthorized" : `HTTP ${response.status}`,
    );
    err.status = response.status;
    err.url = url;
    err.body = text;
    throw err;
  }

  if (response.status === 204) return undefined as any;

  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json"))
    return (await response.json()) as T;
  return (await response.text()) as any;
}
