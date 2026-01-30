// apps/server/src/lib/auth.ts

import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

const JWT_SECRET: string = (() => {
  const v = process.env.JWT_SECRET;
  if (!v) {
    // In production we must not fall back to a default secret.
    throw new Error("JWT_SECRET is required (production)");
  }
  return v;
})();

export interface AuthUser {
  userId: string;
  email?: string | null;
  // allow standard JWT claims without typing headaches
  iat?: number;
  exp?: number;
}

function isAuthUser(payload: unknown): payload is AuthUser {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as any;
  return typeof p.userId === "string" && p.userId.length > 0;
}

export function getAuthUser(request: NextRequest): AuthUser | null {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      console.warn("[auth] missing Authorization header");
      return null;
    }
    if (!authHeader.startsWith("Bearer ")) {
      console.warn("[auth] malformed Authorization header");
      return null;
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!isAuthUser(decoded)) {
      console.warn("[auth] token missing required userId claim");
      return null;
    }

    return decoded;
  } catch (error: any) {
    // Helpful debug for 401s (do NOT log the token)
    const msg = error?.message ? String(error.message) : "jwt verify failed";
    console.warn("[auth] invalid token:", msg);
    return null;
  }
}
