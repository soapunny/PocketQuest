// apps/mobile/src/lib/plansApi.ts
import { API_BASE_URL } from "./config"; // 네 프로젝트 방식에 맞게

console.log("[planApi] API_BASE_URL =", API_BASE_URL);

export async function postRollover() {
  const res = await fetch(`${API_BASE_URL}/api/plans/rollover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`rollover failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<{
    rolled: boolean;
    createdCount?: number;
    activePlan?: any;
    reason?: string;
  }>;
}
