import { useCallback, useState } from "react";

import { fetchBootstrap } from "../api/bootstrapApi";
import { useAuth } from "../store/authStore";
import { usePlanStore } from "../store/planStore";
import { useDashboardStore } from "../store/dashboardStore";
import { useUserPrefsStore } from "../store/userPrefsStore";

export function useBootStrap() {
  const { user } = useAuth();
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
      // Token may be stored on the user object in future auth flows.
      const token = (user as any)?.token ? String((user as any).token) : undefined;
      const payload = await fetchBootstrap(token);

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
    user,
  ]);

  return {
    isBootstrapping,
    bootstrapError,
    runBootstrap,
  };
}

