// apps/server/src/lib/plan/planTypes.ts

import { PeriodType, CurrencyCode, LanguageCode } from "@prisma/client";

/**
 * Data shape used by routes when creating a new Plan.
 * DB create 시 사용되는 데이터 구조 (플랜 생성 시 사용되는 데이터 구조, 아직 DB에 저장되지 않은 데이터이기 때문에 entity x)
 */
export type PlanCreateData = {
  userId: string;
  periodType: PeriodType;
  periodStart: Date;
  periodEnd: Date;
  periodAnchor: Date | null;
  timeZone: string;
  currency: CurrencyCode;
  language: LanguageCode;
  totalBudgetLimitMinor: number;
};
