// packages/shared/src/auth/types.ts

export type OAuthProvider = "google" | "kakao";

export interface AuthSyncRequestDTO {
  supabaseAccessToken: string; // Authorization Bearer token과 동일한 값
}

export interface AuthSyncResponseDTO {
  user: {
    id: string; // internal user id (Prisma user id)
    supabaseUserId: string; // SSOT key (추천)
    email: string;
    name: string;
    profileImageUri: string | null;
  };
}
