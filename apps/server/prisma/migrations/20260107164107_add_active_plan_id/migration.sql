/*
  Warnings:

  - A unique constraint covering the columns `[activePlanId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activePlanId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_activePlanId_key" ON "User"("activePlanId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activePlanId_fkey" FOREIGN KEY ("activePlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
