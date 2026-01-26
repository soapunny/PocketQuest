-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "savingsGoalId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_savingsGoalId_idx" ON "Transaction"("savingsGoalId");

-- CreateIndex
CREATE INDEX "Transaction_userId_savingsGoalId_occurredAt_idx" ON "Transaction"("userId", "savingsGoalId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_savingsGoalId_fkey" FOREIGN KEY ("savingsGoalId") REFERENCES "SavingsGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
