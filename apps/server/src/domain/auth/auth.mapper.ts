//  apps/server/src/domain/auth/auth.mapper.ts

import { AuthSyncResponseDTO } from "@pq/shared/auth/types";
import { UserRecord } from "./auth.repository";
import { HttpError } from "@/lib/http/httpError";

export type ClientProvider = "google" | "kakao";
export type PrismaProvider = "GOOGLE" | "KAKAO";

export function toPrismaProvider(p: ClientProvider): PrismaProvider {
  return p === "kakao" ? "KAKAO" : "GOOGLE";
}

export function toClientProvider(p: unknown): ClientProvider {
  const v = String(p ?? "")
    .toLowerCase()
    .trim();

  if (v === "google") return "google";
  if (v === "kakao") return "kakao";

  // Do not default to google — it can corrupt records.
  throw new HttpError(400, "Unsupported auth provider", {
    provider: v || null,
  });
}

export function mapUserRecordToAuthSyncResponseDTO(
  userRecord: UserRecord,
): AuthSyncResponseDTO {
  const email = userRecord.email; // email은 반드시 존재해야 함
  if (!email) {
    // This should never happen if DB + auth policy is correct.
    throw new HttpError(500, "User record is missing email");
  }

  return {
    user: {
      id: userRecord.id,
      supabaseUserId: userRecord.supabaseUserId,
      email,
      name: userRecord.name,
      profileImageUri: userRecord.profileImageUri,
    },
  };
}
