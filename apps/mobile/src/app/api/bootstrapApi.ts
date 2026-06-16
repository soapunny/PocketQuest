// apps/mobile/src/app/api/bootstrapApi.ts

import { request } from "./http";

import type { BootstrapResponseDTO } from "@pq/shared/bootstrap";

export async function fetchBootstrap(
  supabaseAccessToken: string,
): Promise<BootstrapResponseDTO> {
  if (!supabaseAccessToken) {
    throw new Error(
      "bootstrap failed: missing auth token (expected Supabase access token)",
    );
  }

  return await request<BootstrapResponseDTO>("/api/bootstrap", {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${supabaseAccessToken}`,
    },
  });
}
