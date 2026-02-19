// apps/mobile/src/app/hooks/useBootStrap.ts

import { useCallback, useState } from "react";

import { fetchBootstrap } from "../api/bootstrapApi";
import { useAuthStore } from "../store/authStore";
import { usePlanStore } from "../store/planStore";
import { useDashboardStore } from "../store/dashboardStore";
import { useUserPrefsStore } from "../store/userPrefsStore";

export function useBootStrap() {
  const auth = useAuthStore();
  const { applyBootstrapPlan } = usePlanStore();
  const applyDashboardFromBootstrap = useDashboardStore(
    (s) => s.applyDashboardFromBootstrap,
  );

  const applyUserPrefsFromBootstrap = useUserPrefsStore(
    (s) => s.applyUserPrefsFromBootstrap,
  );

  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const runBootstrap = useCallback(async () => {
    if (isBootstrapping) return;
    setIsBootstrapping(true);
    setBootstrapError(null);

    try {
      // Bootstrap uses the Supabase access_token (SSOT) as our API auth token.
      const token = String(auth.supabaseAccessToken ?? "").trim();
      console.log({
        hasSession: !!auth.session,
        hasSupabaseToken: !!auth.supabaseAccessToken,
      });
      if (!token) {
        throw new Error(
          "Bootstrap failed: missing auth token (expected Supabase access token)",
        );
      }

      console.log("[bootstrap] token length:", token.length);
      const payload = await fetchBootstrap(token);
      console.log(
        "[bootstrap] bootstrap ok, keys:",
        Object.keys(payload ?? {}),
      );
      console.log("[bootstrap] txSummary?", !!(payload as any)?.txSummary);

      // 1) user prefs (source of truth)
      applyUserPrefsFromBootstrap(payload?.user);

      // 2) plan hydration (plan only; prefs are NOT injected here)
      applyBootstrapPlan(payload);

      // 3) dashboard hydration (bootstrap-only)
      applyDashboardFromBootstrap(payload);
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : "Bootstrap failed";
      setBootstrapError(msg);
    } finally {
      setIsBootstrapping(false);
    }
  }, [
    applyBootstrapPlan,
    applyDashboardFromBootstrap,
    applyUserPrefsFromBootstrap,
    isBootstrapping,
    auth.supabaseAccessToken,
  ]);

  return {
    isBootstrapping,
    bootstrapError,
    runBootstrap,
  };
}
