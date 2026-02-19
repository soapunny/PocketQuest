//  apps/server/src/domain/plan/plan.repository.ts

import { prisma } from "@/lib/prisma";

export async function createDefaultWeeklyPlanForUser(input: {
  userId: string;
  timeZone: string;
  currency: string;
  language: string;
}) {
  return prisma.plan.create({
    data: {
      userId: input.userId,
      periodType: "WEEKLY",
      periodStart: new Date(),
      timeZone: input.timeZone,
      currency: input.currency as any,
      language: input.language as any,
    },
  });
}

export async function setUserActivePlanId(userId: string, planId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { activePlanId: planId },
  });
}

