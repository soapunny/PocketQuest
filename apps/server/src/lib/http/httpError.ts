// apps/server/src/lib/http/httpError.ts

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonRouteError(error: unknown, logLabel?: string) {
  const httpError = jsonHttpError(error);
  if (httpError) return httpError;

  const zodError = jsonZodError(error);
  if (zodError) return zodError;

  return jsonInternalError(error, logLabel);
}

export function jsonHttpError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json(
      {
        error: error.message ?? "Error",
        ...(error.payload ?? {}),
      },
      { status: error.status },
    );
  }

  return null;
}

export function jsonZodError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid request data",
        details: error.issues,
      },
      { status: 400 },
    );
  }

  return null;
}

export function jsonUnauthorized(devHint: string | null) {
  return NextResponse.json(
    {
      error: "Unauthorized",
      ...(process.env.NODE_ENV !== "production" && devHint
        ? { hint: devHint }
        : {}),
    },
    { status: 401 },
  );
}

export function jsonInternalError(error: unknown, logLabel?: string) {
  if (logLabel) {
    console.error(logLabel, error);
  } else {
    console.error(error);
  }

  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export type ErrorPayload = Record<string, unknown>;

export class HttpError extends Error {
  readonly status: number;
  readonly payload?: ErrorPayload;

  constructor(status: number, message: string, payload?: ErrorPayload) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.payload = payload;
  }
}
