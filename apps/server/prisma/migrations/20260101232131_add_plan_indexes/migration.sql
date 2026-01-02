-- CreateIndex
CREATE INDEX "Plan_userId_periodType_periodStart_idx" ON "Plan"("userId", "periodType", "periodStart");
