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

  const method = String(options.method ?? "GET").toUpperCase();
  console.log("[http]", method, url);

  const response = await fetch(url, { ...options, headers });

  console.log("[http] resp", { url, status: response.status, ok: response.ok });

  if (response.ok && method === "GET" && url.endsWith("/api/plans")) {
    const text = await response
      .clone()
      .text()
      .catch(() => "");
    console.log("[http] /api/plans body:", text);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.log("[http] error", { url, status: response.status, body: text });

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
