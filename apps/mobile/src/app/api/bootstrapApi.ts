// apps/mobile/src/app/api/bootstrapApi.ts

import { request } from "./http";

export type BootstrapResponse = {
  user: {
    id: string;
    timeZone: string;
    currency: string;
    language: string;
  };
  activePlan: any;
  periodNav: any;
  goals: {
    budget: any[];
    savings: any[];
  };
  txSummary: any;
  recentTransactions?: any[];
};

export async function fetchBootstrap(
  token: string,
): Promise<BootstrapResponse> {
  if (!token) {
    throw new Error(
      "bootstrap failed: missing auth token (expected server JWT)",
    );
  }

  // Helpful debug (does not print the token)
  console.log("[bootstrapApi] GET /api/bootstrap (auth: yes)");

  return await request<BootstrapResponse>("/api/bootstrap", {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}
