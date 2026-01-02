import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { z } from "zod";

const updateTransactionSchema = z.object({
  type: z.enum(["EXPENSE", "INCOME", "SAVING"]).optional(),
  amountMinor: z.number().int().nonnegative().optional(),
  currency: z.enum(["USD", "KRW"]).optional(),
  fxUsdKrw: z.number().optional().nullable(),
  category: z.string().optional(),
  occurredAtISO: z.string().datetime().optional(),
  note: z.string().optional().nullable(),
});

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

  return null;
}

// GET /api/transactions/[id] - Get single transaction
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getAuthUser(request);
  const devUserId = !user ? getDevUserId(request) : null;
  const userId = user?.userId ?? devUserId;

  if (!userId) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        hint:
          process.env.NODE_ENV !== "production"
            ? "DEV: pass x-dev-user-id header or ?userId=..."
            : undefined,
      },
      { status: 401 }
    );
  }

  try {
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: params.id,
        userId,
      },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(transaction);
  } catch (error) {
    console.error("Get transaction error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/transactions/[id] - Update transaction
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getAuthUser(request);

  try {
    const body: unknown = await request.json();

    const devUserId = !user ? getDevUserId(request, body) : null;
    const userId = user?.userId ?? devUserId;

    if (!userId) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          hint:
            process.env.NODE_ENV !== "production"
              ? "DEV: pass x-dev-user-id header or include userId in body"
              : undefined,
        },
        { status: 401 }
      );
    }

    const data = updateTransactionSchema.parse(body);

    // Check if transaction exists and belongs to user
    const existing = await prisma.transaction.findFirst({
      where: {
        id: params.id,
        userId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Never pass occurredAtISO directly to Prisma (model field is occurredAt)
    const { occurredAtISO, ...rest } = data;
    const updateData: any = { ...rest };

    if (occurredAtISO) {
      updateData.occurredAt = new Date(occurredAtISO);
    }

    const transaction = await prisma.transaction.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({ transaction });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Update transaction error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/transactions/[id] - Delete transaction
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getAuthUser(request);
  const devUserId = !user ? getDevUserId(request) : null;
  const userId = user?.userId ?? devUserId;

  if (!userId) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        hint:
          process.env.NODE_ENV !== "production"
            ? "DEV: pass x-dev-user-id header or ?userId=..."
            : undefined,
      },
      { status: 401 }
    );
  }

  try {
    // Check if transaction exists and belongs to user
    const existing = await prisma.transaction.findFirst({
      where: {
        id: params.id,
        userId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.transaction.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete transaction error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
