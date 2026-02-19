// apps/server/src/middleware.ts

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Debug: log all API requests reaching Next.js middleware
  console.log("[mw]", request.method, request.nextUrl.pathname, {
    origin: request.headers.get("origin"),
  });

  // CORS headers
  const response = NextResponse.next();

  const origin = request.headers.get("origin");
  const allowedOrigins = [
    "http://localhost:19006", // Expo web
    "http://localhost:8081", // Expo dev server
    "exp://localhost:8081", // Expo dev
    "http://10.0.0.68:19006",
    "http://10.0.0.68:8081",
    "exp://10.0.0.68:8081",
  ];

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }

  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  response.headers.set("Access-Control-Allow-Credentials", "true");

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 200, headers: response.headers });
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
