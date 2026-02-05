-- CreateEnum
CREATE TYPE "CashflowCarryoverMode" AS ENUM ('ROLLING');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cashflowCarryoverEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cashflowCarryoverMode" "CashflowCarryoverMode" NOT NULL DEFAULT 'ROLLING';
