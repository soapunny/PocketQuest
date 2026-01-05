import { PrismaClient } from "@prisma/client";

// 글로벌 객체에 PrismaClient를 캐싱하기 위한 타입 선언
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// PrismaClient를 한 번만 생성 (개발 환경에서 핫리로드 대응)
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// 개발 환경에서는 글로벌에 캐싱
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
