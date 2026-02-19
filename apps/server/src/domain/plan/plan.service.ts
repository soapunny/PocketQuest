//  apps/server/src/domain/plan/plan.service.ts

import * as authRepo from "@/domain/auth/auth.repository";
import * as planRepo from "./plan.repository";

export async function ensureActivePlan(userId: string) {
  const user = await authRepo.findUserById(userId);
  if (!user) throw new Error("User not found");

  if (user.activePlanId) return user;

  const plan = await planRepo.createDefaultWeeklyPlanForUser({
    userId: user.id,
    timeZone: user.timeZone,
    currency: user.currency,
    language: user.language,
  });

  return planRepo.setUserActivePlanId(user.id, plan.id);
}

