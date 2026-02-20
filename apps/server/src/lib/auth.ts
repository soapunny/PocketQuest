//  apps/server/src/lib/auth.ts

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "./prisma";

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

function getDevUserId(request: NextRequest, body?: unknown): string | null {
  if (process.env.NODE_ENV === "production") return null;

  const headerId = request.headers.get("x-dev-user-id");
  if (headerId && headerId.trim()) return headerId.trim();

  const urlId = request.nextUrl.searchParams.get("userId");
  if (urlId && urlId.trim()) return urlId.trim();

  if (body && typeof body === "object" && body !== null && "userId" in body) {
    const v = (body as any).userId;
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  const envId = process.env.DEV_USER_ID;
  if (envId && envId.trim()) return envId.trim();

  return null;
}

// Helper to resolve internal userId (authenticated or dev) and dev hint
export async function resolveInternalUserId(
  request: NextRequest,
  body?: unknown,
): Promise<{ userId: string | null; devHint: string | null }> {
  const authed = await getAuthUser(request);

  const devUserId = !authed ? getDevUserId(request, body) : null;

  if (authed?.supabaseUserId) {
    const internal = await prisma.user.findUnique({
      where: { supabaseUserId: authed.supabaseUserId },
      select: { id: true },
    });

    if (internal?.id) {
      return { userId: internal.id, devHint: null };
    }

    return { userId: null, devHint: null };
  }

  if (devUserId) {
    return {
      userId: devUserId,
      devHint: "DEV: pass x-dev-user-id header or ?userId=... (or body.userId)",
    };
  }

  return { userId: null, devHint: null };
}
