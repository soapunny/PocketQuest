import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// DATABASE_URL은 .env에 있어야 함 (Supabase Postgres connection string)
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Next dev에서 조용히 죽지 말고 원인 바로 보이게
  throw new Error("DATABASE_URL is missing. Set it in apps/server/.env");
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString })),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
