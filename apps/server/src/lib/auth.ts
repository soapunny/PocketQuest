//  apps/server/src/lib/auth.ts

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url) throw new Error("SUPABASE_URL is required");
  if (!anonKey) throw new Error("SUPABASE_ANON_KEY is required");

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export interface AuthUser {
  supabaseUserId: string;
  email: string;
}

export function extractBearerToken(request: NextRequest): string | null {
  const authHeader =
    request.headers.get("authorization") ??
    request.headers.get("Authorization");
  if (!authHeader) return null;

  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

/**
 * Option 1: Supabase access_token is the single session token.
 * This function verifies the Bearer token with Supabase and returns verified identity.
 */
export async function getAuthUser(
  request: NextRequest,
): Promise<AuthUser | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id || !data.user.email) return null;

    return {
      supabaseUserId: data.user.id,
      email: data.user.email,
    };
  } catch {
    return null;
  }
}
