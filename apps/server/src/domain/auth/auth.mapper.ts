//  apps/server/src/domain/auth/auth.mapper.ts

import { UserRecord } from "./auth.repository";

export type ClientProvider = "google" | "kakao";
export type PrismaProvider = "GOOGLE" | "KAKAO";

export function toPrismaProvider(p: ClientProvider): PrismaProvider {
  return p.toUpperCase() as PrismaProvider;
}

export function toClientProvider(p: unknown): ClientProvider {
  return String(p).toUpperCase() === "KAKAO" ? "kakao" : "google";
}

export function mapUserRecordToAuthSyncResponseDTO(userRecord: UserRecord) {
  return {
    id: userRecord.id,
    supabaseUserId: userRecord.supabaseUserId,
    email: userRecord.email,
    name: userRecord.name,
    profileImageUri: userRecord.profileImageUri,
  };
}
