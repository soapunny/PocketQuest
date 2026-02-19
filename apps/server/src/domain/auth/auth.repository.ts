//  apps/server/src/domain/auth/auth.repository.ts

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { PrismaProvider } from "./auth.mapper";

export type UserRecord = Prisma.UserGetPayload<{}>;

export async function findUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { email },
  });
}

export async function createUser(data: {
  supabaseUserId: string;
  email: string;
  name: string;
  profileImageUri: string | null;
  provider: PrismaProvider;
  providerId: string;
}): Promise<UserRecord> {
  return prisma.user.create({ data });
}

export async function updateUser(
  id: string,
  data: {
    supabaseUserId?: string;
    provider?: PrismaProvider;
    providerId?: string;
    name?: string;
    profileImageUri?: string | null;
  },
): Promise<UserRecord> {
  return prisma.user.update({
    where: { id },
    data,
  });
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { id },
  });
}

export async function findUserBySupabaseUserId(
  supabaseUserId: string,
): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { supabaseUserId },
  });
}
