// apps/server/src/lib/prisma/prismaErrors.ts

import { Prisma } from "@prisma/client";
import { HttpError } from "../http/httpError";

function throwHttpFromPrisma(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2025: "Record not found" (update/delete 대상 없음)
    if (error.code === "P2025") {
      throw new HttpError(404, "Not found");
    }

    // P2002: Unique constraint
    if (error.code === "P2002") {
      throw new HttpError(409, "Resource already exists");
    }

    // default known request error
    throw new HttpError(400, "Database error", {
      code: error.code,
      ...(process.env.NODE_ENV !== "production"
        ? { message: error.message, meta: error.meta ?? null }
        : {}),
    });
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    throw new HttpError(
      400,
      "Database validation error",
      process.env.NODE_ENV !== "production"
        ? { message: error.message }
        : undefined,
    );
  }

  // Unknown / unexpected
  throw new HttpError(500, "Internal server error");
}

export async function prismaHttpGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throwHttpFromPrisma(e);
  }
}
