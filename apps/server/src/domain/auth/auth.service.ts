//  apps/server/src/domain/auth/auth.service.ts

import { createClient } from "@supabase/supabase-js";

import {
  toPrismaProvider,
  mapUserRecordToAuthSyncResponseDTO,
} from "./auth.mapper";
import * as authRepo from "./auth.repository";
import { ensureActivePlan } from "@/domain/plan/plan.service";
import { HttpError } from "@/lib/http/httpError";

/**
 * Supabase Auth is the source of truth (Option 1).
 * - Client sends Supabase access_token via Authorization: Bearer <token>
 * - Backend verifies token with Supabase and syncs/creates internal user
 * - Backend does NOT mint a separate PocketQuest JWT
 */
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url) throw new HttpError(500, "SUPABASE_URL is required");
  if (!anonKey) throw new HttpError(500, "SUPABASE_ANON_KEY is required");

  return createClient(url, anonKey, {
    //Supabase REST API 호출을 위한 SDK Client 생성
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function toClientProviderFromSupabase(provider: unknown): "google" | "kakao" {
  const p = String(provider ?? "")
    .toLowerCase()
    .trim();

  if (p === "google") return "google";
  if (p === "kakao") return "kakao";

  // Do not silently default to google: that can corrupt user records.
  throw new HttpError(400, "Unsupported auth provider", {
    provider: p || null,
  });
}

function deriveIdentityFromSupabaseUser(user: any) {
  // supabase.user를 받아서(PocketQuest.User X)
  const supabaseUserId = String(user?.id ?? "").trim(); // Supabase.user.id -> PocketQuest.User.supabaseUserId
  if (!supabaseUserId) throw new HttpError(400, "Supabase user missing id");

  const identities = Array.isArray(user?.identities) ? user.identities : [];

  // Prefer a known provider identity if multiple exist.
  // If we still can't determine, fail fast (do not guess).
  const known =
    identities.find(
      (i: any) => String(i?.provider ?? "").toLowerCase() === "google",
    ) ??
    identities.find(
      (i: any) => String(i?.provider ?? "").toLowerCase() === "kakao",
    ) ??
    null;

  const primaryIdentity = known;

  const provider = toClientProviderFromSupabase(primaryIdentity?.provider);

  const email = String(user?.email ?? "").trim();
  if (!email) throw new HttpError(400, "Supabase user missing email");

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.name === "string" && meta.name.trim()) ||
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (email ? email.split("@")[0] : "") ||
    "User";

  const profileImageUri =
    (typeof meta.avatar_url === "string" && meta.avatar_url.trim()) ||
    (typeof meta.picture === "string" && meta.picture.trim()) ||
    null;

  // B-policy: prefer external provider raw id (google sub, kakao id, etc.)
  const identityData = (primaryIdentity?.identity_data ?? {}) as Record<
    string,
    unknown
  >;

  const externalProviderId =
    (typeof identityData.sub === "string" && identityData.sub.trim()) || // Google
    (typeof identityData.id === "string" && identityData.id.trim()) || // Some providers
    (typeof identityData.user_id === "string" && identityData.user_id.trim()) || // other providers
    "";

  // If Supabase doesn't provide external id, fallback to supabaseUserId (safe)
  const providerId = (externalProviderId || supabaseUserId).trim();

  if (!providerId)
    throw new HttpError(400, "Supabase identity missing providerId");

  return { supabaseUserId, provider, providerId, email, name, profileImageUri };
}

export async function signInWithSupabaseAccessToken(accessToken: string) {
  const supabase = getSupabaseClient();

  // 1) Verify Supabase access token and fetch verified user
  const { data, error } = await supabase.auth.getUser(accessToken); // Supabase SDK 활용해서 토큰 검증
  if (error || !data?.user) {
    console.error("Supabase getUser error:", error);
    throw new HttpError(401, "Unauthorized"); //Access token is invalid or expired
  }

  // 2) Derive identity ONLY from verified Supabase user
  const { supabaseUserId, provider, providerId, email, name, profileImageUri } =
    deriveIdentityFromSupabaseUser(data.user); // supabase.user 정보

  const prismaProvider = toPrismaProvider(provider);

  // 1) SSOT lookup first
  let userRecord = await authRepo.findUserBySupabaseUserId(supabaseUserId);

  if (!userRecord) {
    // Email 기반 자동 병합 금지
    const existingUser = await authRepo.findUserByEmail(email);

    //동일 이메일이 이미 있는 경우
    if (existingUser) {
      // 이미 동일 email로 가입된 계정이 있지만
      // supabaseUserId가 다르면 다른 provider로 생성된 계정일 가능성
      // → 자동 병합 금지 (다른 앱들과 동일 정책)
      throw new HttpError(
        409,
        "Account already exists with different login method",
        {
          conflict: "EMAIL_ALREADY_USED",
          email,
          // optionally expose only provider info if you want UI messaging:
          // existingProvider: existingUser.provider,
        },
      );
    }

    // 완전히 신규 사용자만 생성
    userRecord = await authRepo.createUser({
      supabaseUserId,
      email,
      name,
      profileImageUri: profileImageUri ?? null,
      provider: prismaProvider,
      providerId,
    });

    userRecord = await ensureActivePlan(userRecord.id);
  } else {
    // keep internal user synced (name/avatar/provider)
    userRecord = await authRepo.updateUser(userRecord.id, {
      provider: prismaProvider,
      providerId,
      name,
      profileImageUri: profileImageUri ?? null,
    });
    userRecord = await ensureActivePlan(userRecord.id);
  }

  return {
    user: mapUserRecordToAuthSyncResponseDTO(userRecord),
  };
}
