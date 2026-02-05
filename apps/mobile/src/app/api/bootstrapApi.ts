// apps/mobile/src/app/api/bootstrapApi.ts

import { request } from "./http";

import type { BootstrapResponseDTO } from "@pq/shared/bootstrap";

export async function fetchBootstrap(
  token: string
): Promise<BootstrapResponseDTO> {
  if (!token) {
    throw new Error(
      "bootstrap failed: missing auth token (expected server JWT)"
    );
  }

  // Helpful debug (does not print the token)
  console.log("[bootstrapApi] GET /api/bootstrap (auth: yes)");

  return await request<BootstrapResponseDTO>("/api/bootstrap", {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}
