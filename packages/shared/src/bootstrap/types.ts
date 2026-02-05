// packages/shared/src/bootstrap/types.ts

import type { DashboardPayloadDTO } from "./dashboard";

export type BootstrapResponseDTO = {
  user: {
    id: string;
    timeZone: string;
    currency: string | null;
    language: string | null;
    activePlanId: string;
    cashflowCarryoverEnabled: boolean;
    cashflowCarryoverMode: "ROLLING";
  };
  activePlan: any; // existing shape 유지 (추후 plans/types로 분리 가능)
  monthly: any;
  periodNav: any;
  dashboard: DashboardPayloadDTO;
  meta: {
    generatedAtUTC: string;
  };
};

