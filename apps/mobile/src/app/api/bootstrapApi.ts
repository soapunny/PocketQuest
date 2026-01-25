// apps/mobile/src/app/api/bootstrapApi.ts

import { API_BASE_URL } from "../config/env";

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

export async function fetchBootstrap(token?: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/bootstrap`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `bootstrap failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    );
  }

  return (await res.json()) as BootstrapResponse;
}
